#!/usr/bin/env sh
set -eu

if [ -z "${CHART_NAME:-}" ]; then
  echo "Missing required environment variable: CHART_NAME" >&2
  exit 1
fi
if [ -z "${WORKSPACE:-}" ]; then
  echo "Missing required environment variable: WORKSPACE" >&2
  exit 1
fi
if [ ! -s "$WORKSPACE/image-digest.txt" ]; then
  echo "Missing image digest produced by Kaniko." >&2
  exit 1
fi
IMAGE_DIGEST="$(tr -d '[:space:]' < "$WORKSPACE/image-digest.txt")"
export IMAGE_DIGEST

case "$CHART_NAME" in
  ai-tutor-service|worksheet-import-service|api-gateway|collaboration-service|email-service|game-adapter-service|keyboard-app|keyboard-service|media-service|payment-service|registration-service|vocabulary-service|web-app) ;;
  *) echo "Unsupported chart: $CHART_NAME" >&2; exit 1 ;;
esac

case "${DEPLOY_ENVIRONMENT:-}" in
  dev)
    CHART_VALUES_FILE="helm-charts/${CHART_NAME}/values-dev.yaml"
    ;;
  prod)
    CHART_VALUES_FILE="helm-charts/${CHART_NAME}/values-prod.yaml"
    ;;
  *)
    echo "DEPLOY_ENVIRONMENT must be dev or prod." >&2
    exit 1
    ;;
esac

export CHART_VALUES_FILE
exec "$(dirname "$0")/update-environment-image.sh"
