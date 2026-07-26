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

require_env DEPLOY_ENVIRONMENT
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
require_env IMAGE_DIGEST

if ! printf '%s\n' "$IMAGE_DIGEST" | grep -Eq '^sha256:[0-9a-f]{64}$'; then
  echo "IMAGE_DIGEST must be an immutable sha256 digest." >&2
  exit 1
fi

case "$INFRA_REPO" in
  https://*) AUTH_REPO="https://${GITHUB_USER}:${GITHUB_TOKEN}@${INFRA_REPO#https://}" ;;
  *) echo "INFRA_REPO must be an https URL: $INFRA_REPO" >&2; exit 1 ;;
esac

case "$DEPLOY_ENVIRONMENT" in
  dev)
    if [ "$INFRA_BRANCH" != "develop" ]; then
      echo "Dev deployment must update the infra develop branch." >&2
      exit 1
    fi
    case "$CHART_VALUES_FILE" in
      helm-charts/*/values-dev.yaml) ;;
      *) echo "Dev deployment must update values-dev.yaml." >&2; exit 1 ;;
    esac
    ;;
  prod)
    case "$CI_BRANCH" in
      release/[0-9]*.[0-9]*.[0-9]*) ;;
      *) echo "Production source must be a numeric release branch." >&2; exit 1 ;;
    esac
    if ! printf '%s\n' "$CI_BRANCH" | grep -Eq '^release/[0-9]+\.[0-9]+\.[0-9]+$'; then
      echo "Production source must match release/<number>.<number>.<number>." >&2
      exit 1
    fi
    if [ "$INFRA_BRANCH" != "$CI_BRANCH" ]; then
      echo "Production must update the matching infra release branch." >&2
      exit 1
    fi
    case "$CHART_VALUES_FILE" in
      helm-charts/*/values-prod.yaml) ;;
      *) echo "Production deployment must update values-prod.yaml." >&2; exit 1 ;;
    esac
    ;;
  *)
    echo "DEPLOY_ENVIRONMENT must be dev or prod." >&2
    exit 1
    ;;
esac

for attempt in 1 2 3 4 5; do
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/playsay-infra-update.XXXXXX")"
  INFRA_DIR="$WORK_DIR/infra"
  remote_branch_exists="false"

  if git ls-remote --exit-code --heads "$AUTH_REPO" "refs/heads/$INFRA_BRANCH" >/dev/null 2>&1; then
    remote_branch_exists="true"
    git clone --single-branch --branch "$INFRA_BRANCH" "$AUTH_REPO" "$INFRA_DIR"
  elif [ "$DEPLOY_ENVIRONMENT" = "prod" ]; then
    git clone --single-branch --branch develop "$AUTH_REPO" "$INFRA_DIR"
    cd "$INFRA_DIR"
    if [ ! -f argocd-apps/prod/current-release.txt ]; then
      echo "Missing argocd-apps/prod/current-release.txt on infra develop." >&2
      exit 1
    fi
    PROD_BASE_BRANCH="$(tr -d '[:space:]' < argocd-apps/prod/current-release.txt)"
    if ! printf '%s\n' "$PROD_BASE_BRANCH" | grep -Eq '^release/[0-9]+\.[0-9]+\.[0-9]+$'; then
      echo "Invalid current production release: $PROD_BASE_BRANCH" >&2
      exit 1
    fi
    git fetch origin "refs/heads/${PROD_BASE_BRANCH}:refs/remotes/origin/${PROD_BASE_BRANCH}"
    git switch -c "$INFRA_BRANCH"
    BASE_VALUES_DIR="$WORK_DIR/current-prod-values"
    mkdir -p "$BASE_VALUES_DIR"
    for target_values in helm-charts/*/values-prod.yaml; do
      if git cat-file -e "origin/${PROD_BASE_BRANCH}:${target_values}" 2>/dev/null; then
        chart_name="$(basename "$(dirname "$target_values")")"
        base_values="$BASE_VALUES_DIR/${chart_name}.yaml"
        git show "origin/${PROD_BASE_BRANCH}:${target_values}" > "$base_values"
        BASE_VALUES_FILE="$base_values" yq -i \
          '.image = load(strenv(BASE_VALUES_FILE)).image | .build = load(strenv(BASE_VALUES_FILE)).build' \
          "$target_values"
      fi
    done
  else
    echo "Infra develop branch does not exist." >&2
    exit 1
  fi

  cd "$INFRA_DIR"
  git config user.email "jenkins@play-and-say.ru"
  git config user.name "Play&Say Jenkins"

  if [ "$DEPLOY_ENVIRONMENT" = "prod" ]; then
    for app_manifest in argocd-apps/prod/root-app.yaml argocd-apps/prod/apps/*.yaml; do
      INFRA_BRANCH="$INFRA_BRANCH" yq -i '.spec.source.targetRevision = strenv(INFRA_BRANCH)' "$app_manifest"
    done
    IMAGE_DIGEST="$IMAGE_DIGEST" yq -i \
      '.image.tag = strenv(BUILD_LABEL) | .image.digest = strenv(IMAGE_DIGEST) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)' \
      "$CHART_VALUES_FILE"
    commit_subject="chore: prepare ${BUILD_LABEL} for production"
    tag_message="Play&Say production candidate ${BUILD_LABEL}"
  else
    IMAGE_DIGEST="$IMAGE_DIGEST" yq -i \
      '.image.tag = strenv(BUILD_LABEL) | .image.digest = strenv(IMAGE_DIGEST) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)' \
      "$CHART_VALUES_FILE"
    commit_subject="chore: deploy ${BUILD_LABEL} to dev"
    tag_message="Play&Say dev deployment ${BUILD_LABEL}"
  fi

  git add "$CHART_VALUES_FILE"
  if [ "$DEPLOY_ENVIRONMENT" = "prod" ]; then
    git add argocd-apps/prod/root-app.yaml argocd-apps/prod/apps
  fi

  if git diff --cached --quiet; then
    echo "No ${DEPLOY_ENVIRONMENT} image reference changes for ${BUILD_LABEL}"
    rm -rf "$WORK_DIR"
    exit 0
  fi

  git commit \
    -m "$commit_subject" \
    -m "Source branch: ${CI_BRANCH}" \
    -m "Source commit: ${GIT_COMMIT}"

  if [ "$remote_branch_exists" = "true" ]; then
    git pull --rebase origin "$INFRA_BRANCH"
  fi

  if git push origin "HEAD:${INFRA_BRANCH}"; then
    if [ "${CREATE_INFRA_TAG:-true}" = "true" ]; then
      if git ls-remote --exit-code --tags origin "refs/tags/${BUILD_LABEL}" >/dev/null 2>&1; then
        echo "Infra tag ${BUILD_LABEL} already exists"
      else
        git tag -a "$BUILD_LABEL" \
          -m "$tag_message" \
          -m "Source branch: ${CI_BRANCH}" \
          -m "Source commit: ${GIT_COMMIT}"
        git push origin "refs/tags/${BUILD_LABEL}"
      fi
    fi
    if [ "$DEPLOY_ENVIRONMENT" = "prod" ]; then
      echo "Production GitOps candidate ${INFRA_BRANCH} is ready for manual ArgoCD sync."
    fi
    rm -rf "$WORK_DIR"
    exit 0
  fi

  rm -rf "$WORK_DIR"
  echo "Infra push race for ${BUILD_LABEL}; retrying ${attempt}/5"
  sleep $((attempt * 3))
done

echo "Could not push ${DEPLOY_ENVIRONMENT} image update for ${BUILD_LABEL} after retries" >&2
exit 1
