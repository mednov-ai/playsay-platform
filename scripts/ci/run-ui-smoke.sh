#!/usr/bin/env sh
set -eu

missing=""
for name in PLAY_SAY_SMOKE_TEACHER_PASSWORD PLAY_SAY_SMOKE_STUDENT_A_PASSWORD PLAY_SAY_SMOKE_STUDENT_B_PASSWORD; do
  value="$(printenv "$name" || true)"
  if [ -z "$value" ]; then
    missing="$missing $name"
  fi
done

if [ -n "$missing" ]; then
  echo "Missing Jenkins smoke secret env:$missing" >&2
  echo "Sync the keycloak-dev-users Kubernetes secret into the jenkins namespace before running smoke." >&2
  exit 1
fi

export PLAY_SAY_SMOKE_FETCH_PASSWORDS=false
export PLAY_SAY_SMOKE_WEB_BASE_URL="${PLAY_SAY_SMOKE_WEB_BASE_URL:-https://dev.online.honey.school}"
export PLAY_SAY_SMOKE_API_BASE_URL="${PLAY_SAY_SMOKE_API_BASE_URL:-https://dev.online.honey.school/api}"
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

SMOKE_NODE_DIR="/tmp/playsay-ui-smoke"
if [ ! -d "$SMOKE_NODE_DIR/node_modules/playwright" ]; then
  rm -rf "$SMOKE_NODE_DIR"
  mkdir -p "$SMOKE_NODE_DIR"
  cat > "$SMOKE_NODE_DIR/package.json" <<'JSON'
{"private":true,"dependencies":{"playwright":"1.56.1"}}
JSON
  npm --prefix "$SMOKE_NODE_DIR" install --cache /cache/npm --prefer-offline --ignore-scripts --no-audit --no-fund
fi
export PLAYWRIGHT_PACKAGE_DIR="$SMOKE_NODE_DIR"

run_with_retries() {
  name="$1"
  attempts="$2"
  command="$3"
  attempt=1
  while [ "$attempt" -le "$attempts" ]; do
    echo "$name attempt $attempt/$attempts"
    if $command; then
      return 0
    fi
    if [ "$attempt" -eq "$attempts" ]; then
      return 1
    fi
    attempt=$((attempt + 1))
    sleep 30
  done
}

suite="${SMOKE_SUITE:-all}"
case "$suite" in
  sprint5)
    run_with_retries "Sprint 5 UI smoke" 6 "./scripts/smoke/sprint5-ui-smoke.mjs"
    ;;
  sprint6)
    run_with_retries "Sprint 6 homework smoke" 3 "./scripts/smoke/sprint6-homework-smoke.mjs"
    ;;
  all)
    run_with_retries "Sprint 5 UI smoke" 6 "./scripts/smoke/sprint5-ui-smoke.mjs"
    run_with_retries "Sprint 6 homework smoke" 3 "./scripts/smoke/sprint6-homework-smoke.mjs"
    ;;
  *)
    echo "Unknown SMOKE_SUITE: $suite" >&2
    exit 1
    ;;
esac
