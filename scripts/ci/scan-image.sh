#!/usr/bin/env sh
set -eu

for name in IMAGE_REPOSITORY GIT_COMMIT BUILD_LABEL WORKSPACE DEPLOY_TO_DEV DEPLOY_TO_PROD; do
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
SECURITY_SCAN_ONLY="${SECURITY_SCAN_ONLY:-false}"
case "$DEPLOY_TO_DEV:$DEPLOY_TO_PROD:$SECURITY_SCAN_ONLY" in
  true:false:false|false:true:false|false:false:true) ;;
  *) echo "Select exactly one deployment target or the scan-only mode." >&2; exit 1 ;;
esac

IMAGE_NAME="${IMAGE_REPOSITORY##*/}"
BUILD_DIR="$WORKSPACE/.image-build/$IMAGE_NAME/$BUILD_LABEL"
REPORT_DIR="$WORKSPACE/image-security/$IMAGE_NAME/$BUILD_LABEL"
IMAGE_TAR="$BUILD_DIR/image.tar"
CACHE_DIR="$WORKSPACE/.image-build/trivy-cache"
mkdir -p "$REPORT_DIR"
rm -f "$BUILD_DIR/scanned.sha256" "$WORKSPACE/image-digest.txt"
if [ ! -s "$IMAGE_TAR" ]; then
  echo "Missing image archive from the current build." >&2
  exit 1
fi
archive_hash_before="$(sha256sum "$IMAGE_TAR" | awk '{print $1}')"

trivy --version > "$REPORT_DIR/scanner-version.txt"
trivy image --config '' --ignorefile '' --cache-dir "$CACHE_DIR" \
  --no-progress --scanners vuln --pkg-types os,library --list-all-pkgs \
  --exit-on-eol 2 --input "$IMAGE_TAR" --format json \
  --output "$REPORT_DIR/full.json" > "$REPORT_DIR/scan.log" 2>&1 || {
    cat "$REPORT_DIR/scan.log" >&2
    exit 1
  }
cat "$REPORT_DIR/scan.log"
if [ ! -s "$REPORT_DIR/full.json" ] ||
   ! sed -n '1,80p' "$REPORT_DIR/full.json" | grep -Eq '"Family": "(alpine|debian|ubuntu|redhat|rocky|oracle|amazon)"' ||
   ! grep -q '"Class": "os-pkgs"' "$REPORT_DIR/full.json"; then
  echo "The report lacks the required OS/package inventory." >&2
  exit 1
fi
if [ ! -s "$CACHE_DIR/db/metadata.json" ]; then
  echo "Missing vulnerability database metadata." >&2
  exit 1
fi
cp "$CACHE_DIR/db/metadata.json" "$REPORT_DIR/database-metadata.json"
if [ -s "$CACHE_DIR/java-db/metadata.json" ]; then
  cp "$CACHE_DIR/java-db/metadata.json" "$REPORT_DIR/java-database-metadata.json"
fi

if ! trivy convert --config '' --ignorefile '' --severity UNKNOWN,HIGH,CRITICAL \
  --format json --exit-code 1 --output "$REPORT_DIR/blocking.json" "$REPORT_DIR/full.json"; then
  echo "Blocking findings or report conversion failure; image was not published." >&2
  exit 1
fi
if [ ! -s "$REPORT_DIR/blocking.json" ]; then
  echo "Missing security gate report." >&2
  exit 1
fi

archive_hash_after="$(sha256sum "$IMAGE_TAR" | awk '{print $1}')"
if [ "$archive_hash_before" != "$archive_hash_after" ]; then
  echo "Image archive changed during its security scan." >&2
  exit 1
fi
printf '%s\n' "$archive_hash_before" > "$BUILD_DIR/scanned.sha256"
cp "$BUILD_DIR/scanned.sha256" "$REPORT_DIR/image-archive.sha256"
if [ "$SECURITY_SCAN_ONLY" = true ]; then
  echo "Scan-only build passed; image was not published."
fi
