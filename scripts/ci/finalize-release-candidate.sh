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

for name in \
  INFRA_REPO \
  PLATFORM_REPO \
  CI_BRANCH \
  GIT_COMMIT \
  GITHUB_USER \
  GITHUB_TOKEN
do
  require_env "$name"
done

if ! printf '%s\n' "$CI_BRANCH" | grep -Eq '^release/[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Only numeric release branches can be finalized." >&2
  exit 1
fi
if ! printf '%s\n' "$GIT_COMMIT" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "GIT_COMMIT must be a full Git SHA." >&2
  exit 1
fi

case "$INFRA_REPO" in
  https://*) AUTH_REPO="https://${GITHUB_USER}:${GITHUB_TOKEN}@${INFRA_REPO#https://}" ;;
  *)
    echo "INFRA_REPO must be an https URL." >&2
    exit 1
    ;;
esac

remote_platform_head="$(
  git ls-remote --exit-code --heads "$PLATFORM_REPO" "refs/heads/$CI_BRANCH" |
    awk 'NR == 1 { print $1 }'
)"
if [ "$remote_platform_head" != "$GIT_COMMIT" ]; then
  echo "Release source is stale: $CI_BRANCH is ${remote_platform_head:-missing}, candidate source is $GIT_COMMIT." >&2
  exit 42
fi

START_DIR="$(pwd)"
MANIFEST_PATH="argocd-apps/prod/release-candidate.yaml"

ensure_helm_dependency_repositories() {
  chart_dir="$1"
  for repository in $(yq -r '.dependencies[]?.repository // ""' "$chart_dir/Chart.yaml"); do
    case "$repository" in
      https://charts.bitnami.com/bitnami)
        helm repo add bitnami "$repository" --force-update >/dev/null
        ;;
      file://*|oci://*) ;;
      "")
        ;;
      *)
        echo "Unsupported Helm dependency repository in $chart_dir: $repository" >&2
        exit 1
        ;;
    esac
  done
}

for attempt in 1 2 3; do
  cd "$START_DIR"
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/playsay-release-finalize.XXXXXX")"
  INFRA_DIR="$WORK_DIR/infra"
  git clone --quiet --single-branch --branch "$CI_BRANCH" "$AUTH_REPO" "$INFRA_DIR"
  cd "$INFRA_DIR"
  git config user.email "jenkins@play-and-say.ru"
  git config user.name "Play&Say Jenkins"

  if [ ! -f "$MANIFEST_PATH" ]; then
    echo "Missing production candidate manifest on $CI_BRANCH." >&2
    exit 1
  fi
  manifest_schema="$(yq -r '.schemaVersion // 0' "$MANIFEST_PATH")"
  if [ "$manifest_schema" != "2" ]; then
    echo "Candidate manifest must use schemaVersion 2; found $manifest_schema." >&2
    exit 1
  fi
  manifest_commit="$(yq -r '.platformSha // ""' "$MANIFEST_PATH")"
  manifest_status="$(yq -r '.status // ""' "$MANIFEST_PATH")"
  if [ "$manifest_commit" != "$GIT_COMMIT" ]; then
    echo "Candidate manifest source $manifest_commit does not match $GIT_COMMIT." >&2
    exit 1
  fi
  if [ "$manifest_status" != "building" ] && [ "$manifest_status" != "ready" ]; then
    echo "Candidate manifest has invalid status: $manifest_status" >&2
    exit 1
  fi

  affected_targets="$(yq -r '.affectedTargets[]?' "$MANIFEST_PATH" | paste -sd, -)"
  migration_targets="$(yq -r '.migrationTargets[]?' "$MANIFEST_PATH" | paste -sd, -)"
  base_infra_commit="$(yq -r '.infraBaseSha // ""' "$MANIFEST_PATH")"
  base_release="$(yq -r '.baseRelease // ""' "$MANIFEST_PATH")"
  if ! printf '%s\n' "$base_infra_commit" | grep -Eq '^[0-9a-f]{40}$'; then
    echo "Candidate manifest has an invalid baseInfraCommit." >&2
    exit 1
  fi
  if ! git cat-file -e "${base_infra_commit}^{commit}" 2>/dev/null; then
    git fetch --quiet origin "refs/heads/${base_release}:refs/remotes/origin/${base_release}"
  fi
  if ! git cat-file -e "${base_infra_commit}^{commit}" 2>/dev/null; then
    echo "Could not load infra baseline commit $base_infra_commit." >&2
    exit 1
  fi

  for target in $(printf '%s' "$affected_targets" | tr ',' ' '); do
    values_file="helm-charts/${target}/values-prod.yaml"
    if [ ! -f "$values_file" ]; then
      echo "Missing production values for affected target $target." >&2
      exit 1
    fi
    build_commit="$(yq -r '.build.commit // ""' "$values_file")"
    image_digest="$(yq -r '.image.digest // ""' "$values_file")"
    if [ "$build_commit" != "$GIT_COMMIT" ]; then
      echo "Affected target $target was not built from $GIT_COMMIT." >&2
      exit 1
    fi
    if ! printf '%s\n' "$image_digest" | grep -Eq '^sha256:[0-9a-f]{64}$'; then
      echo "Affected target $target has no immutable image digest." >&2
      exit 1
    fi
  done

  for migration_target in $(printf '%s' "$migration_targets" | tr ',' ' '); do
    case ",$affected_targets," in
      *",$migration_target,"*) ;;
      *)
        echo "Migration target $migration_target is not an affected deploy target." >&2
        exit 1
        ;;
    esac
    case "$migration_target" in
      api-gateway|ai-tutor-service|vocabulary-service|payment-service|registration-service|email-service|keyboard-service) ;;
      *)
        echo "Unsupported production migration target: $migration_target" >&2
        exit 1
        ;;
    esac
  done

  for values_file in helm-charts/*/values-prod.yaml; do
    chart_name="$(basename "$(dirname "$values_file")")"
    case ",$affected_targets," in
      *",$chart_name,"*) ;;
      *)
        if git cat-file -e "${base_infra_commit}:${values_file}" 2>/dev/null; then
          current_metadata="$(yq -o=json -I=0 '{"image": .image, "build": .build}' "$values_file")"
          base_metadata="$(git show "${base_infra_commit}:${values_file}" | yq -o=json -I=0 '{"image": .image, "build": .build}' -)"
          if [ "$current_metadata" != "$base_metadata" ]; then
            echo "Unaffected chart $chart_name changed image/build metadata." >&2
            exit 1
          fi
        fi
        ;;
    esac
  done

  for app_manifest in argocd-apps/prod/root-app.yaml argocd-apps/prod/apps/*.yaml; do
    target_revision="$(yq -r '.spec.source.targetRevision // ""' "$app_manifest")"
    if [ "$target_revision" != "$CI_BRANCH" ]; then
      echo "$app_manifest targets $target_revision instead of $CI_BRANCH." >&2
      exit 1
    fi
  done

  for values_file in helm-charts/*/values-prod.yaml; do
    chart_dir="$(dirname "$values_file")"
    chart_name="$(basename "$chart_dir")"
    rendered_file="$WORK_DIR/${chart_name}.yaml"
    if grep -Eq '^dependencies:' "$chart_dir/Chart.yaml"; then
      ensure_helm_dependency_repositories "$chart_dir"
      helm dependency build --skip-refresh "$chart_dir" >/dev/null
    fi
    helm template "$chart_name" "$chart_dir" -f "$values_file" > "$rendered_file"
    image_repository="$(yq -r '.image.repository // ""' "$values_file")"
    image_digest="$(yq -r '.image.digest // ""' "$values_file")"
    if [ -n "$image_repository" ] && [ -n "$image_digest" ]; then
      if ! grep -F "${image_repository}@${image_digest}" "$rendered_file" >/dev/null; then
        echo "Rendered chart $chart_name does not use ${image_repository}@${image_digest}." >&2
        exit 1
      fi
    fi
  done

  if [ "$manifest_status" != "ready" ]; then
    updated_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    validated_infra_sha="$(git rev-parse HEAD)"
    UPDATED_AT="$updated_at" VALIDATED_INFRA_SHA="$validated_infra_sha" yq -i \
      '.status = "ready" | .infraSha = strenv(VALIDATED_INFRA_SHA) | .updatedAt = strenv(UPDATED_AT)' \
      "$MANIFEST_PATH"
    git add "$MANIFEST_PATH"
    git commit --quiet \
      -m "chore: mark ${CI_BRANCH} production candidate ready" \
      -m "Source commit: ${GIT_COMMIT}"
  else
    validated_infra_sha="$(yq -r '.infraSha // ""' "$MANIFEST_PATH")"
    if ! printf '%s\n' "$validated_infra_sha" | grep -Eq '^[0-9a-f]{40}$'; then
      echo "Ready candidate has an invalid infraSha." >&2
      exit 1
    fi
  fi

  if git push --quiet origin "HEAD:${CI_BRANCH}"; then
    cd "$START_DIR"
    rm -rf "$WORK_DIR"
    echo "Production candidate $CI_BRANCH is ready for reviewed Argo Workflows promotion."
    exit 0
  fi

  cd "$START_DIR"
  rm -rf "$WORK_DIR"
  echo "Infra finalization push race; retrying ${attempt}/3"
  sleep $((attempt * 2))
done

echo "Could not finalize production candidate $CI_BRANCH after retries." >&2
exit 1
