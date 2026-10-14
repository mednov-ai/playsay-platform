#!/usr/bin/env sh
set -eu
: "${WORKSPACE:?Missing workspace}"
: "${BUILD_LABEL:?Missing build label}"
digest=$(tr -d '[:space:]' < "$WORKSPACE/image-digest.txt")
hex=${digest#sha256:}
[ "$hex" != "$digest" ] && [ "${#hex}" -eq 64 ] || { echo 'Invalid Keycloak digest' >&2; exit 1; }
case "$hex" in *[!0-9a-f]*) echo 'Invalid Keycloak digest' >&2; exit 1 ;; esac
deadline=$(( $(date +%s) + ${PLAYSAY_DEV_ROLLOUT_TIMEOUT_SECONDS:-420} ))
while [ "$(date +%s)" -lt "$deadline" ]; do
 state=$(kubectl -n keycloak get statefulset keycloak -o json)
 pods=$(kubectl -n keycloak get pods -l app.kubernetes.io/name=keycloak -o json)
 if printf '%s' "$state" | jq -e --arg digest "$digest" '
   .spec.template.spec.containers[0].image | endswith("@"+$digest)' >/dev/null &&
   printf '%s' "$state" | jq -e '
   .status.observedGeneration >= .metadata.generation and
   .status.currentRevision == .status.updateRevision and
   (.status.readyReplicas // 0) == (.spec.replicas // 1) and
   (.status.updatedReplicas // 0) == (.spec.replicas // 1)' >/dev/null &&
   printf '%s' "$pods" | jq -e --arg digest "$digest" '
   (.items | length) > 0 and all(.items[];
    .status.phase == "Running" and (.status.containerStatuses | length) > 0 and
    all(.status.containerStatuses[]; .ready == true and .restartCount == 0 and (.imageID | endswith("@"+$digest))))' >/dev/null; then
  echo "Keycloak ${BUILD_LABEL} immutable digest is Ready with zero restarts"
  exit 0
 fi
 echo 'Waiting for the requested Keycloak digest and StatefulSet readiness'
 sleep "${PLAYSAY_DEV_ROLLOUT_POLL_SECONDS:-10}"
done
echo 'Keycloak requested digest did not become Ready with zero restarts' >&2
exit 1
