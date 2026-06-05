#!/usr/bin/env sh
set -eu

require_env() {
  name="$1"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_env PLATFORM_REPO
require_env GITHUB_USER
require_env GITHUB_TOKEN
require_env CI_BRANCH
require_env GIT_COMMIT
require_env BUILD_LABEL

git config --global user.email "jenkins@play-and-say.ru"
git config --global user.name "Play&Say Jenkins"

case "$PLATFORM_REPO" in
  https://*) AUTH_REPO="https://${GITHUB_USER}:${GITHUB_TOKEN}@${PLATFORM_REPO#https://}" ;;
  *) echo "PLATFORM_REPO must be an https URL: $PLATFORM_REPO" >&2; exit 1 ;;
esac

if git ls-remote --exit-code --tags "$AUTH_REPO" "refs/tags/${BUILD_LABEL}" >/dev/null 2>&1; then
  echo "Source tag ${BUILD_LABEL} already exists"
  exit 0
fi

rm -rf source-for-tag
git clone --branch "$CI_BRANCH" "$AUTH_REPO" source-for-tag
cd source-for-tag
git checkout "$GIT_COMMIT"
git tag -a "$BUILD_LABEL" \
  -m "Play&Say build ${BUILD_LABEL}" \
  -m "Branch: ${CI_BRANCH}" \
  -m "Commit: ${GIT_COMMIT}" \
  -m "Jenkins build: ${BUILD_URL:-unknown}"
git push "$AUTH_REPO" "refs/tags/${BUILD_LABEL}"
