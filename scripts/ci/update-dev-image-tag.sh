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

require_env INFRA_REPO
require_env INFRA_BRANCH
require_env GITHUB_USER
require_env GITHUB_TOKEN
require_env CHART_VALUES_FILE
require_env BUILD_LABEL
require_env BUILD_NUMBER
require_env CI_BRANCH
require_env BUILD_LABEL_PREFIX
require_env GIT_COMMIT
require_env GIT_COMMIT_SHORT

case "$INFRA_REPO" in
  https://*) AUTH_REPO="https://${GITHUB_USER}:${GITHUB_TOKEN}@${INFRA_REPO#https://}" ;;
  *) echo "INFRA_REPO must be an https URL: $INFRA_REPO" >&2; exit 1 ;;
esac

for attempt in 1 2 3 4 5; do
  rm -rf infra
  git clone --branch "$INFRA_BRANCH" "$AUTH_REPO" infra
  cd infra
  git config user.email "jenkins@play-and-say.ru"
  git config user.name "Play&Say Jenkins"

  yq -i ".image.tag = strenv(BUILD_LABEL) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)" "$CHART_VALUES_FILE"
  git add "$CHART_VALUES_FILE"

  if git diff --cached --quiet; then
    echo "No dev image tag changes for ${BUILD_LABEL}"
    exit 0
  fi

  git commit \
    -m "chore: deploy ${BUILD_LABEL} to dev" \
    -m "Source branch: ${CI_BRANCH}" \
    -m "Source commit: ${GIT_COMMIT}"
  git pull --rebase origin "$INFRA_BRANCH"

  if git push origin "HEAD:${INFRA_BRANCH}"; then
    if [ "${CREATE_INFRA_TAG:-true}" = "true" ]; then
      if git ls-remote --exit-code --tags origin "refs/tags/${BUILD_LABEL}" >/dev/null 2>&1; then
        echo "Infra tag ${BUILD_LABEL} already exists"
      else
        git tag -a "$BUILD_LABEL" \
          -m "Play&Say dev deployment ${BUILD_LABEL}" \
          -m "Source branch: ${CI_BRANCH}" \
          -m "Source commit: ${GIT_COMMIT}"
        git push origin "refs/tags/${BUILD_LABEL}"
      fi
    fi
    exit 0
  fi

  cd ..
  echo "Infra push race for ${BUILD_LABEL}; retrying ${attempt}/5"
  sleep $((attempt * 3))
done

echo "Could not push dev image tag update for ${BUILD_LABEL} after retries" >&2
exit 1
