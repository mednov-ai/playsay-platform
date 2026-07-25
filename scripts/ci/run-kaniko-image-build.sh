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

if [ "$DEPLOY_TO_DEV" = "true" ] && [ "$DEPLOY_TO_PROD" = "true" ]; then
  echo "A build cannot target dev and prod at the same time." >&2
  exit 1
fi
if [ "$DEPLOY_TO_DEV" != "true" ] && [ "$DEPLOY_TO_PROD" != "true" ]; then
  echo "The image build has no deployment target." >&2
  exit 1
fi

DIGEST_FILE="$WORKSPACE/image-digest.txt"
rm -f "$DIGEST_FILE"

set -- \
  --context "$KANIKO_CONTEXT" \
  --dockerfile "$KANIKO_DOCKERFILE" \
  --destination "${IMAGE_REPOSITORY}:${GIT_COMMIT}" \
  --destination "${IMAGE_REPOSITORY}:${BUILD_LABEL}" \
  --digest-file "$DIGEST_FILE"

if [ "$DEPLOY_TO_DEV" = "true" ]; then
  set -- "$@" --destination "${IMAGE_REPOSITORY}:dev"
fi

exec "${KANIKO_EXECUTOR:-/kaniko/executor}" "$@"
