#!/usr/bin/env sh
set -eu

for name in IMAGE_REPOSITORY BUILD_LABEL WORKSPACE DEPLOY_TO_DEV DEPLOY_TO_PROD; do
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
case "$DEPLOY_TO_DEV:$DEPLOY_TO_PROD:${SECURITY_SCAN_ONLY:-false}" in
  true:false:false|false:true:false) ;;
  *) echo "Image publication requires exactly one deployment target." >&2; exit 1 ;;
esac

IMAGE_NAME="${IMAGE_REPOSITORY##*/}"
BUILD_DIR="$WORKSPACE/.image-build/$IMAGE_NAME/$BUILD_LABEL"
REPORT_DIR="$WORKSPACE/image-security/$IMAGE_NAME/$BUILD_LABEL"
if [ ! -s "$BUILD_DIR/scanned.sha256" ] || [ ! -s "$REPORT_DIR/full.json" ] ||
   [ ! -s "$REPORT_DIR/blocking.json" ]; then
  echo "Missing security evidence for publication." >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64) crane_arch=x86_64; crane_sha=0ab7a1d6932a213aed964ce97666c3077fe691c8606413674a8b3e0b9ec4cda0 ;;
  aarch64|arm64) crane_arch=arm64; crane_sha=898c0cff975f898a33e8c4580bdafb0e7c02c7faa33374e946762f97c4ab7110 ;;
  *) echo "Unsupported CI architecture." >&2; exit 1 ;;
esac
crane_archive="$BUILD_DIR/crane.tar.gz"
wget -q -T 90 -O "$crane_archive" \
  "https://github.com/google/go-containerregistry/releases/download/v0.22.1/go-containerregistry_Linux_${crane_arch}.tar.gz"
printf '%s  %s\n' "$crane_sha" "$crane_archive" | sha256sum -c -
tar -xzf "$crane_archive" -C "$BUILD_DIR" crane
export CRANE_BIN="$BUILD_DIR/crane"
export DOCKER_CONFIG=/kaniko/.docker
exec "$(dirname "$0")/publish-scanned-image.sh"
