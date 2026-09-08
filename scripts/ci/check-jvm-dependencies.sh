#!/bin/sh
# Run from any directory. Only the module selector is accepted; policy cannot be disabled.
set +x
set -eu
umask 077
case "${1:-all}" in
  all|inventory|keycloak-standalone) ;;
  *[!a-zA-Z0-9:_-]*|'') echo 'Invalid JVM module selector' >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { echo 'Usage: check-jvm-dependencies.sh [all|inventory|module|keycloak-standalone]' >&2; exit 2; }
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
# Read a raw local secret as data, never source a shell/env file.
key_file=${NVD_API_KEY_FILE:-"$repo/.env.nvd-api-key"}
if [ -z "${NVD_API_KEY:-}" ] && [ -f "$key_file" ]; then
  NVD_API_KEY=$(tr -d '\r\n' < "$key_file")
  [ -n "$NVD_API_KEY" ] || { echo 'NVD API key file is empty' >&2; exit 2; }
  export NVD_API_KEY
fi
gradle_bin=${GRADLE_BIN:-gradle}
mkdir -p "$repo/backend/build/dependency-security-data"
run=$(mktemp -d "$repo/backend/build/dependency-security-data/run.XXXXXXXX")
reports="$repo/backend/build/reports/dependency-security"
mkdir -p "$reports"
# Each run has its own reports and writable database; stale reports cannot imply success.
run_id=$(basename "$run")
reports="$reports/$run_id"
mkdir -p "$reports"
export DEPENDENCY_SECURITY_DATA_DIR="$run/data"
mkdir -p "$DEPENDENCY_SECURITY_DATA_DIR"
finish() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ]; then echo 'state=failed-or-incomplete' >> "$reports/status.txt"; fi
  printf 'exit_code=%s\nfinished_at=%s\n' "$code" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$reports/status.txt"
  echo "Dependency security reports: $reports"
  # Keep the database for an operator to reuse as a seed, never share it for writing.
  exit "$code"
}
trap finish EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
printf 'state=running\nsource_revision=%s\nstarted_at=%s\n' "$(git -C "$repo" rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$reports/status.txt"
if [ -n "${DEPENDENCY_SECURITY_CACHE_SEED:-}" ]; then
  [ -d "$DEPENDENCY_SECURITY_CACHE_SEED" ] || { echo 'Cache seed is not a directory' >&2; exit 2; }
  cp -R "$DEPENDENCY_SECURITY_CACHE_SEED/." "$DEPENDENCY_SECURITY_DATA_DIR/"
  rm -f "$DEPENDENCY_SECURITY_DATA_DIR/honey-update-success"
fi
run_gradle() {
  "$gradle_bin" -p "$DEPENDENCY_SECURITY_BUILD_ROOT" -I "$repo/backend/gradle/dependency-security.init.gradle" \
    --no-daemon --no-configuration-cache --no-parallel --max-workers=1 \
    -Pkotlin.compiler.execution.strategy=in-process "$@"
}
export DEPENDENCY_SECURITY_BUILD_ROOT="$repo/backend/build-logic"
export DEPENDENCY_SECURITY_REPORT_DIR="$reports/build-logic"
export DEPENDENCY_SECURITY_MODULE=all
run_gradle dependencySecurityInventory
if [ "${1:-all}" != inventory ]; then
  run_gradle dependencyCheckUpdate
  date -u +%Y-%m-%dT%H:%M:%SZ > "$DEPENDENCY_SECURITY_DATA_DIR/honey-update-success"
  cp "$DEPENDENCY_SECURITY_DATA_DIR/honey-update-success" "$reports/advisory-update.txt"
  # --continue retains reports for other modules after a vulnerability finding.
  tooling_status=0
  run_gradle dependencySecurity --continue || tooling_status=$?
fi
export DEPENDENCY_SECURITY_BUILD_ROOT="$repo/backend"
export DEPENDENCY_SECURITY_REPORT_DIR="$reports/backend"
export DEPENDENCY_SECURITY_MODULE="${1:-all}"
case "$DEPENDENCY_SECURITY_MODULE" in
  inventory) export DEPENDENCY_SECURITY_MODULE=all ;;
  keycloak-standalone)
    export DEPENDENCY_SECURITY_BUILD_ROOT="$repo/backend/keycloak-lesson-authenticator"
    export DEPENDENCY_SECURITY_MODULE=all ;;
esac
if [ "${1:-all}" = inventory ]; then
  run_gradle dependencySecurityInventory
  echo 'state=inventory-only' >> "$reports/status.txt"
else
  backend_status=0
  run_gradle dependencySecurity --continue || backend_status=$?
  [ "$tooling_status" -eq 0 ] && [ "$backend_status" -eq 0 ] || { echo 'state=failed' >> "$reports/status.txt"; exit 1; }
  if [ -f "$reports/build-logic/accepted-risks.txt" ] || [ -f "$reports/backend/accepted-risks.txt" ]; then
    echo 'state=passed-with-accepted-risks' >> "$reports/status.txt"
  else
    echo 'state=passed' >> "$reports/status.txt"
  fi
fi
