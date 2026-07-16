#!/usr/bin/env sh
set -eu

require_env() {
  name="$1"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_env BUILD_LABEL

APPS="${APPS:-${APP:-}}"
if [ -z "$APPS" ]; then
  echo "Set APPS or APP to the ArgoCD application name(s) to wait for." >&2
  exit 1
fi

EXPECTED_BUILD="${EXPECTED_BUILD:-$BUILD_LABEL}"
TIMEOUT_SECONDS="${PLAYSAY_DEV_ROLLOUT_TIMEOUT_SECONDS:-420}"
POLL_SECONDS="${PLAYSAY_DEV_ROLLOUT_POLL_SECONDS:-10}"
ARGOCD_REFRESH_MODE="${ARGOCD_REFRESH_MODE:-webhook}"
DEADLINE="$(( $(date +%s) + TIMEOUT_SECONDS ))"

if [ -x "./scripts/ci/manage-build-capacity.sh" ]; then
  for app in $APPS; do
    CI_BUILD_ID="${JOB_NAME:-jenkins}-${BUILD_NUMBER:-unknown}" \
      CI_TARGET_APP="$app" \
      ./scripts/ci/manage-build-capacity.sh restore-target
  done
fi

if [ "$ARGOCD_REFRESH_MODE" = "annotate" ]; then
  kubectl -n argocd annotate application $APPS argocd.argoproj.io/refresh=hard --overwrite || true
elif [ "$ARGOCD_REFRESH_MODE" != "webhook" ]; then
  echo "Unknown ARGOCD_REFRESH_MODE: $ARGOCD_REFRESH_MODE" >&2
  exit 1
fi

while true; do
  all_ready="true"
  echo "Checking dev rollout for ${EXPECTED_BUILD}"

  for app in $APPS; do
    sync_status="$(kubectl -n argocd get application "$app" -o jsonpath='{.status.sync.status}' 2>/dev/null || true)"
    health_status="$(kubectl -n argocd get application "$app" -o jsonpath='{.status.health.status}' 2>/dev/null || true)"
    deployment_json="$(kubectl -n playsay-dev get deployment "$app" -o json 2>/dev/null || true)"

    if [ -z "$deployment_json" ]; then
      echo "  ${app}: deployment is not visible yet"
      all_ready="false"
      continue
    fi

    deploy_build="$(printf "%s" "$deployment_json" | jq -r '.spec.template.metadata.labels["playsay.io/build-name"] // ""')"
    desired="$(printf "%s" "$deployment_json" | jq -r '.spec.replicas // 1')"
    updated="$(printf "%s" "$deployment_json" | jq -r '.status.updatedReplicas // 0')"
    ready="$(printf "%s" "$deployment_json" | jq -r '.status.readyReplicas // 0')"
    available="$(printf "%s" "$deployment_json" | jq -r '.status.availableReplicas // 0')"
    ready_pods="$(kubectl -n playsay-dev get pods -l "app.kubernetes.io/name=${app},playsay.io/build-name=${EXPECTED_BUILD}" -o json \
      | jq -r '[.items[] | select(.status.phase == "Running") | select((.status.containerStatuses // []) | length > 0) | select([.status.containerStatuses[]?.ready] | all)] | length')"

    echo "  ${app}: argocd=${sync_status}/${health_status} build=${deploy_build} replicas updated=${updated} ready=${ready} available=${available} expected=${desired} readyPods=${ready_pods}"

    if [ "$sync_status" != "Synced" ] ||
       [ "$health_status" != "Healthy" ] ||
       [ "$deploy_build" != "$EXPECTED_BUILD" ] ||
       [ "$updated" -lt "$desired" ] ||
       [ "$ready" -lt "$desired" ] ||
       [ "$available" -lt "$desired" ] ||
       [ "$ready_pods" -lt "$desired" ]; then
      all_ready="false"
    fi
  done

  if [ "$all_ready" = "true" ]; then
    echo "Dev rollout ${EXPECTED_BUILD} is ready"
    exit 0
  fi

  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "Timed out waiting for dev rollout ${EXPECTED_BUILD}" >&2
    kubectl -n argocd get applications $APPS \
      -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REV:.status.sync.revision || true
    kubectl -n playsay-dev get deployments $APPS \
      -o custom-columns=NAME:.metadata.name,BUILD:.spec.template.metadata.labels.playsay\\.io/build-name,UPDATED:.status.updatedReplicas,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas || true
    kubectl -n playsay-dev get pods --show-labels || true
    exit 1
  fi

  sleep "$POLL_SECONDS"
done
