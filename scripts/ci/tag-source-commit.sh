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

EXISTING_TAG_REFS="$(git ls-remote --tags "$AUTH_REPO" "refs/tags/${BUILD_LABEL}" "refs/tags/${BUILD_LABEL}^{}")"
if [ -n "$EXISTING_TAG_REFS" ]; then
  EXISTING_COMMIT="$(printf '%s\n' "$EXISTING_TAG_REFS" | awk '$2 ~ /\^\{\}$/ { print $1; exit }')"
  if [ -z "$EXISTING_COMMIT" ]; then
    EXISTING_COMMIT="$(printf '%s\n' "$EXISTING_TAG_REFS" | awk 'NR == 1 { print $1 }')"
  fi
  if [ "$EXISTING_COMMIT" = "$GIT_COMMIT" ]; then
    echo "Source tag ${BUILD_LABEL} already points to ${GIT_COMMIT}"
    exit 0
  fi
  echo "Source tag collision: ${BUILD_LABEL} points to ${EXISTING_COMMIT}, expected ${GIT_COMMIT}" >&2
  echo "Raise the Jenkins next build number above the historical maximum before retrying." >&2
  exit 1
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
