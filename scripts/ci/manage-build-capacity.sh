#!/bin/sh
set -eu

STATE_NAMESPACE="${CI_CAPACITY_NAMESPACE:-jenkins}"
STATE_NAME="${CI_CAPACITY_STATE_NAME:-playsay-ci-capacity-state}"
LEASE_NAME="${CI_CAPACITY_LEASE_NAME:-playsay-ci-capacity}"
VM_QUERY_URL="${CI_CAPACITY_VM_QUERY_URL:-http://monitoring-lite-victoria-metrics.monitoring.svc.cluster.local:8428/victoria-metrics/api/v1/query}"
HOLDER="${CI_BUILD_ID:-${JOB_NAME:-jenkins}-${BUILD_NUMBER:-unknown}}"
AGENT_POD="${HOSTNAME:-}"
TARGET_APP="${CI_TARGET_APP:-}"

WORKLOADS="playsay-dev/ai-tutor-service
playsay-dev/vocabulary-service
playsay-dev/media-service
playsay-dev/registration-service
playsay-dev/email-service
playsay-dev/payment-service
playsay-dev/keyboard-app
playsay-dev/keyboard-service"

state_value() {
  kubectl -n "$STATE_NAMESPACE" get configmap "$STATE_NAME" -o "jsonpath={.data.$1}" 2>/dev/null || true
}

query_value() {
  curl -fsS -G "$VM_QUERY_URL" --data-urlencode "query=$1" |
    jq -er '.data.result[0].value[1] | tonumber'
}

restore_all() {
  active="$(state_value active)"
  [ "$active" = "true" ] || return 0

  current_holder="$(state_value holder)"
  if [ -n "$current_holder" ] && [ "$current_holder" != "$HOLDER" ] && [ "${CI_CAPACITY_FORCE_RESTORE:-false}" != "true" ]; then
    echo "Capacity belongs to $current_holder; $HOLDER will not restore it."
    return 0
  fi

  replicas="$(state_value replicas)"
  printf '%s\n' "$replicas" | while IFS='=' read -r workload count; do
    [ -n "$workload" ] || continue
    namespace="${workload%%/*}"
    deployment="${workload#*/}"
    echo "Restoring $namespace/$deployment to $count replica(s)."
    kubectl -n "$namespace" scale deployment "$deployment" --replicas="$count" || true
  done

  kubectl -n "$STATE_NAMESPACE" patch configmap "$STATE_NAME" --type merge \
    -p '{"data":{"active":"false","holder":"","agentPod":"","deadlineEpoch":"0","replicas":"","breachSinceEpoch":"0"}}' >/dev/null
  kubectl -n "$STATE_NAMESPACE" patch lease "$LEASE_NAME" --type merge \
    -p '{"spec":{"holderIdentity":"","renewTime":null}}' >/dev/null
}

restore_target() {
  case "$TARGET_APP" in
    ai-tutor-service|vocabulary-service|media-service|registration-service|email-service|payment-service|keyboard-app|keyboard-service) ;;
    *) return 0 ;;
  esac

  replicas="$(state_value replicas)"
  desired="$(printf '%s\n' "$replicas" | awk -F= -v key="playsay-dev/$TARGET_APP" '$1 == key { print $2; exit }')"
  [ -n "$desired" ] || desired=1
  echo "Restoring rollout target playsay-dev/$TARGET_APP to $desired replica(s)."
  kubectl -n playsay-dev scale deployment "$TARGET_APP" --replicas="$desired"
}

acquire() {
  active="$(state_value active)"
  if [ "$active" = "true" ]; then
    current_holder="$(state_value holder)"
    current_pod="$(state_value agentPod)"
    if [ "$current_holder" = "$HOLDER" ] && [ "$current_pod" = "$AGENT_POD" ]; then
      echo "Capacity is already held by this build."
      return 0
    fi
    if [ -n "$current_pod" ] && kubectl -n "$STATE_NAMESPACE" get pod "$current_pod" >/dev/null 2>&1; then
      echo "Capacity is still held by active build $current_holder ($current_pod)." >&2
      return 1
    fi
    CI_CAPACITY_FORCE_RESTORE=true restore_all
  fi

  replicas=""
  printf '%s\n' "$WORKLOADS" | while IFS= read -r workload; do
    namespace="${workload%%/*}"
    deployment="${workload#*/}"
    kubectl -n "$namespace" get deployment "$deployment" >/dev/null
  done
  for workload in $WORKLOADS; do
    namespace="${workload%%/*}"
    deployment="${workload#*/}"
    count="$(kubectl -n "$namespace" get deployment "$deployment" -o jsonpath='{.spec.replicas}')"
    replicas="${replicas}${workload}=${count}
"
  done

  now_epoch="$(date +%s)"
  deadline_epoch="$((now_epoch + 2400))"
  now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  state_patch="$(jq -nc \
    --arg holder "$HOLDER" \
    --arg pod "$AGENT_POD" \
    --arg deadline "$deadline_epoch" \
    --arg replicas "$replicas" \
    '{data:{active:"true",holder:$holder,agentPod:$pod,deadlineEpoch:$deadline,replicas:$replicas,breachSinceEpoch:"0"}}')"
  lease_patch="$(jq -nc \
    --arg holder "$HOLDER" \
    --arg now "$now_iso" \
    '{spec:{holderIdentity:$holder,leaseDurationSeconds:2400,acquireTime:$now,renewTime:$now}}')"
  kubectl -n "$STATE_NAMESPACE" patch configmap "$STATE_NAME" --type merge -p "$state_patch" >/dev/null
  kubectl -n "$STATE_NAMESPACE" patch lease "$LEASE_NAME" --type merge -p "$lease_patch" >/dev/null

  for workload in $WORKLOADS; do
    namespace="${workload%%/*}"
    deployment="${workload#*/}"
    echo "Pausing $namespace/$deployment for CI capacity."
    kubectl -n "$namespace" scale deployment "$deployment" --replicas=0
  done

  termination_deadline="$(( $(date +%s) + 180 ))"
  while [ "$(date +%s)" -lt "$termination_deadline" ]; do
    remaining=0
    for workload in $WORKLOADS; do
      namespace="${workload%%/*}"
      deployment="${workload#*/}"
      current="$(kubectl -n "$namespace" get deployment "$deployment" -o jsonpath='{.status.replicas}' 2>/dev/null || true)"
      current="${current:-0}"
      [ "$current" -eq 0 ] || remaining=$((remaining + current))
    done
    [ "$remaining" -eq 0 ] && break
    sleep 5
  done

  stable_samples=0
  preflight_deadline="$(( $(date +%s) + 600 ))"
  while [ "$(date +%s)" -lt "$preflight_deadline" ]; do
    ready="$(kubectl get nodes -o jsonpath='{range .items[*]}{range .status.conditions[?(@.type=="Ready")]}{.status}{end}{end}' 2>/dev/null || true)"
    mem_available="$(query_value 'node_memory_MemAvailable_bytes' 2>/dev/null || true)"
    load1="$(query_value 'node_load1' 2>/dev/null || true)"
    io_wait="$(query_value '100 * avg(rate(node_cpu_seconds_total{mode="iowait"}[2m]))' 2>/dev/null || true)"

    healthy=false
    if [ "$ready" = "True" ] && [ -n "$mem_available" ] && [ -n "$load1" ] && [ -n "$io_wait" ]; then
      if awk "BEGIN { exit !(($mem_available >= 2684354560) && ($load1 <= 4) && ($io_wait <= 10)) }"; then
        healthy=true
      fi
    fi

    if [ "$healthy" = true ]; then
      stable_samples=$((stable_samples + 1))
    else
      stable_samples=0
    fi
    echo "CI preflight: ready=${ready:-unknown} memAvailable=${mem_available:-unknown} load1=${load1:-unknown} ioWait=${io_wait:-unknown} stable=$stable_samples/5"

    if [ "$stable_samples" -ge 5 ]; then
      echo "CI capacity preflight passed."
      return 0
    fi
    sleep 30
  done

  echo "CI capacity preflight did not reach safe thresholds within 10 minutes." >&2
  restore_all
  return 1
}

case "${1:-}" in
  acquire) acquire ;;
  restore) restore_all ;;
  restore-target) restore_target ;;
  status)
    kubectl -n "$STATE_NAMESPACE" get configmap "$STATE_NAME" -o json |
      jq '{active:.data.active,holder:.data.holder,agentPod:.data.agentPod,deadlineEpoch:.data.deadlineEpoch,replicas:.data.replicas}'
    ;;
  *)
    echo "Usage: $0 acquire|restore|restore-target|status" >&2
    exit 2
    ;;
esac

