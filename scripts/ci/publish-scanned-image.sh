#!/usr/bin/env sh
set -eu

for name in IMAGE_REPOSITORY GIT_COMMIT BUILD_LABEL WORKSPACE DEPLOY_TO_DEV DEPLOY_TO_PROD CRANE_BIN; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done
case "$IMAGE_REPOSITORY" in
  ghcr.io/mednov-ai/*) ;;
  *) echo "Unexpected image repository: $IMAGE_REPOSITORY" >&2; exit 1 ;;
esac
case "$BUILD_LABEL" in
  ''|*[!A-Za-z0-9_.-]*) echo "Invalid image build label." >&2; exit 1 ;;
esac
if ! printf '%s\n' "$GIT_COMMIT" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "GIT_COMMIT must be a full lowercase commit SHA." >&2
  exit 1
fi
if [ "$DEPLOY_TO_DEV" = "$DEPLOY_TO_PROD" ] ||
   { [ "$DEPLOY_TO_DEV" != true ] && [ "$DEPLOY_TO_DEV" != false ]; } ||
   { [ "$DEPLOY_TO_PROD" != true ] && [ "$DEPLOY_TO_PROD" != false ]; }; then
  echo "Exactly one deployment target must be selected." >&2
  exit 1
fi

IMAGE_NAME="${IMAGE_REPOSITORY##*/}"
BUILD_DIR="$WORKSPACE/.image-build/$IMAGE_NAME/$BUILD_LABEL"
REPORT_DIR="$WORKSPACE/image-security/$IMAGE_NAME/$BUILD_LABEL"
IMAGE_TAR="$BUILD_DIR/image.tar"
DIGEST_FILE="$WORKSPACE/image-digest.txt"
rm -f "$DIGEST_FILE"
if [ ! -s "$IMAGE_TAR" ] || [ ! -s "$BUILD_DIR/scanned.sha256" ] ||
   [ ! -s "$REPORT_DIR/full.json" ] || [ ! -s "$REPORT_DIR/blocking.json" ]; then
  echo "Missing image archive or security evidence." >&2
  exit 1
fi
expected_archive_hash="$(cat "$BUILD_DIR/scanned.sha256")"
actual_archive_hash="$(sha256sum "$IMAGE_TAR" | awk '{print $1}')"
if [ "$actual_archive_hash" != "$expected_archive_hash" ]; then
  echo "Image archive changed after its security scan." >&2
  exit 1
fi
if [ "$("$CRANE_BIN" version)" != '0.22.1' ]; then
  echo "Unexpected image publisher version." >&2
  exit 1
fi

commit_ref="${IMAGE_REPOSITORY}:${GIT_COMMIT}"
local_digest="$("$CRANE_BIN" digest --tarball "$IMAGE_TAR" "$commit_ref")"
if ! printf '%s\n' "$local_digest" | grep -Eq '^sha256:[0-9a-f]{64}$'; then
  echo "Unable to determine the scanned image digest." >&2
  exit 1
fi
"$CRANE_BIN" push "$IMAGE_TAR" "$commit_ref"
remote_digest="$("$CRANE_BIN" digest "$commit_ref")"
if [ "$local_digest" != "$remote_digest" ]; then
  echo "Published digest differs from the scanned image; refusing deployment." >&2
  exit 1
fi
"$CRANE_BIN" tag "${IMAGE_REPOSITORY}@${remote_digest}" "$BUILD_LABEL"
if [ "$DEPLOY_TO_DEV" = true ]; then
  "$CRANE_BIN" tag "${IMAGE_REPOSITORY}@${remote_digest}" dev
fi
printf '%s\n' "$remote_digest" > "$REPORT_DIR/published-digest.txt"
printf '%s\n' "$remote_digest" > "$DIGEST_FILE"
