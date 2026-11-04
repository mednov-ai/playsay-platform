#!/busybox/sh
set -eu

require_env() {
  name="$1"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_env KANIKO_CONTEXT
require_env KANIKO_DOCKERFILE
require_env IMAGE_REPOSITORY
require_env GIT_COMMIT
require_env BUILD_LABEL
require_env WORKSPACE
require_env DEPLOY_TO_DEV
require_env DEPLOY_TO_PROD

case "$IMAGE_REPOSITORY" in
  ghcr.io/mednov-ai/*) ;;
  *) echo "Unexpected image repository: $IMAGE_REPOSITORY" >&2; exit 1 ;;
esac

SECURITY_SCAN_ONLY="${SECURITY_SCAN_ONLY:-false}"
case "$DEPLOY_TO_DEV:$DEPLOY_TO_PROD:$SECURITY_SCAN_ONLY" in
  true:false:false|false:true:false|false:false:true) ;;
  *) echo "Select exactly one deployment target or the scan-only mode." >&2; exit 1 ;;
esac

DIGEST_FILE="$WORKSPACE/image-digest.txt"
rm -f "$DIGEST_FILE"

case "$BUILD_LABEL" in
  ''|*[!A-Za-z0-9_.-]*) echo "Invalid image build label." >&2; exit 1 ;;
esac
IMAGE_NAME="${IMAGE_REPOSITORY##*/}"
BUILD_DIR="$WORKSPACE/.image-build/$IMAGE_NAME/$BUILD_LABEL"
mkdir -p "$BUILD_DIR"
rm -f "$BUILD_DIR/image.tar" "$BUILD_DIR/scanned.sha256"

"${KANIKO_EXECUTOR:-/kaniko/executor}" \
  --context "$KANIKO_CONTEXT" \
  --dockerfile "$KANIKO_DOCKERFILE" \
  --destination "${IMAGE_REPOSITORY}:${GIT_COMMIT}" \
  --no-push \
  --no-push-cache \
  --tar-path "$BUILD_DIR/image.tar"

if [ ! -s "$BUILD_DIR/image.tar" ]; then
  echo "Kaniko did not produce a non-empty image archive." >&2
  exit 1
fi
