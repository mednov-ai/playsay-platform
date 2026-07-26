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

for name in \
  INFRA_REPO \
  CI_BRANCH \
  GIT_COMMIT \
  BASE_RELEASE_BRANCH \
  BASE_PLATFORM_COMMIT \
  GITHUB_USER \
  GITHUB_TOKEN \
  JENKINS_JOB_NAME \
  JENKINS_BUILD_NUMBER
do
  require_env "$name"
done

for branch in "$CI_BRANCH" "$BASE_RELEASE_BRANCH"; do
  if ! printf '%s\n' "$branch" | grep -Eq '^release/[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "Release candidate branches must match release/<number>.<number>.<number>: $branch" >&2
    exit 1
  fi
done
for commit in "$GIT_COMMIT" "$BASE_PLATFORM_COMMIT"; do
  if ! printf '%s\n' "$commit" | grep -Eq '^[0-9a-f]{40}$'; then
    echo "Release candidate commits must be full Git SHAs: $commit" >&2
    exit 1
  fi
done

TARGET_ORDER="api-gateway ai-tutor-service vocabulary-service web-app collaboration-service media-service payment-service registration-service email-service keyboard-service keyboard-app"
VALIDATION_ORDER="ci-contracts smoke-syntax"

normalize_list() {
  requested="$(printf '%s' "${1:-}" | tr ',' ' ')"
  order="$2"
  result=""
  for item in $order; do
    case " $requested " in
      *" $item "*)
        if [ -n "$result" ]; then
          result="${result},"
        fi
        result="${result}${item}"
        ;;
    esac
  done
  printf '%s\n' "$result"
}

validate_list() {
  requested="$(printf '%s' "${1:-}" | tr ',' ' ')"
  order="$2"
  label="$3"
  for item in $requested; do
    case " $order " in
      *" $item "*) ;;
      *)
        echo "Unknown $label value: $item" >&2
        exit 1
        ;;
    esac
  done
}

validate_list "${AFFECTED_TARGETS:-}" "$TARGET_ORDER" "affected target"
validate_list "${VALIDATION_SUITES:-}" "$VALIDATION_ORDER" "validation suite"

case "$INFRA_REPO" in
  https://*) AUTH_REPO="https://${GITHUB_USER}:${GITHUB_TOKEN}@${INFRA_REPO#https://}" ;;
  *)
    echo "INFRA_REPO must be an https URL." >&2
    exit 1
    ;;
esac

START_DIR="$(pwd)"
MANIFEST_PATH="argocd-apps/prod/release-candidate.yaml"

for attempt in 1 2 3 4 5; do
  cd "$START_DIR"
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/playsay-release-prepare.XXXXXX")"
  INFRA_DIR="$WORK_DIR/infra"

  if git ls-remote --exit-code --heads "$AUTH_REPO" "refs/heads/$CI_BRANCH" >/dev/null 2>&1; then
    git clone --quiet --single-branch --branch "$CI_BRANCH" "$AUTH_REPO" "$INFRA_DIR"
    cd "$INFRA_DIR"
    base_infra_commit="$(git rev-parse HEAD)"
  else
    git clone --quiet --single-branch --branch develop "$AUTH_REPO" "$INFRA_DIR"
    cd "$INFRA_DIR"
    current_release="$(tr -d '[:space:]' < argocd-apps/prod/current-release.txt)"
    if [ "$current_release" != "$BASE_RELEASE_BRANCH" ]; then
      echo "Production baseline moved from $BASE_RELEASE_BRANCH to $current_release; rerun detection." >&2
      exit 1
    fi
    git fetch --quiet origin "refs/heads/${BASE_RELEASE_BRANCH}:refs/remotes/origin/${BASE_RELEASE_BRANCH}"
    base_infra_commit="$(git rev-parse "refs/remotes/origin/${BASE_RELEASE_BRANCH}^{commit}")"
    git switch --quiet -c "$CI_BRANCH"

    BASE_VALUES_DIR="$WORK_DIR/current-prod-values"
    mkdir -p "$BASE_VALUES_DIR"
    for target_values in helm-charts/*/values-prod.yaml; do
      if git cat-file -e "origin/${BASE_RELEASE_BRANCH}:${target_values}" 2>/dev/null; then
        chart_name="$(basename "$(dirname "$target_values")")"
        base_values="$BASE_VALUES_DIR/${chart_name}.yaml"
        git show "origin/${BASE_RELEASE_BRANCH}:${target_values}" > "$base_values"
        BASE_VALUES_FILE="$base_values" yq -i \
          '.image = load(strenv(BASE_VALUES_FILE)).image | .build = load(strenv(BASE_VALUES_FILE)).build' \
          "$target_values"
      fi
    done
  fi

  git config user.email "jenkins@play-and-say.ru"
  git config user.name "Play&Say Jenkins"

  previous_targets=""
  if [ -f "$MANIFEST_PATH" ]; then
    previous_status="$(yq -r '.status // ""' "$MANIFEST_PATH")"
    if [ "$previous_status" != "ready" ]; then
      previous_targets="$(yq -r '.affectedTargets[]?' "$MANIFEST_PATH" | paste -sd, -)"
    fi
  fi
  combined_targets="$(normalize_list "${AFFECTED_TARGETS:-},${previous_targets}" "$TARGET_ORDER")"
  normalized_validations="$(normalize_list "${VALIDATION_SUITES:-}" "$VALIDATION_ORDER")"

  for app_manifest in argocd-apps/prod/root-app.yaml argocd-apps/prod/apps/*.yaml; do
    INFRA_BRANCH="$CI_BRANCH" yq -i '.spec.source.targetRevision = strenv(INFRA_BRANCH)' "$app_manifest"
  done

  updated_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  {
    echo "schemaVersion: 1"
    echo "status: building"
    printf 'releaseBranch: "%s"\n' "$CI_BRANCH"
    printf 'baseRelease: "%s"\n' "$BASE_RELEASE_BRANCH"
    printf 'basePlatformCommit: "%s"\n' "$BASE_PLATFORM_COMMIT"
    printf 'baseInfraCommit: "%s"\n' "$base_infra_commit"
    printf 'platformCommit: "%s"\n' "$GIT_COMMIT"
    echo "affectedTargets:"
    for target in $(printf '%s' "$combined_targets" | tr ',' ' '); do
      printf '  - "%s"\n' "$target"
    done
    echo "validationSuites:"
    for suite in $(printf '%s' "$normalized_validations" | tr ',' ' '); do
      printf '  - "%s"\n' "$suite"
    done
    echo "dispatcher:"
    printf '  job: "%s"\n' "$JENKINS_JOB_NAME"
    printf '  build: "%s"\n' "$JENKINS_BUILD_NUMBER"
    printf 'updatedAt: "%s"\n' "$updated_at"
  } > "$MANIFEST_PATH"

  git add "$MANIFEST_PATH" argocd-apps/prod/root-app.yaml argocd-apps/prod/apps helm-charts/*/values-prod.yaml
  if ! git diff --cached --quiet; then
    git commit --quiet \
      -m "chore: start ${CI_BRANCH} production candidate" \
      -m "Source commit: ${GIT_COMMIT}" \
      -m "Affected targets: ${combined_targets:-none}"
  fi

  if git push --quiet origin "HEAD:${CI_BRANCH}"; then
    cd "$START_DIR"
    rm -rf "$WORK_DIR"
    echo "Production candidate $CI_BRANCH is marked building."
    echo "RELEASE_AFFECTED_TARGETS=$combined_targets"
    exit 0
  fi

  cd "$START_DIR"
  rm -rf "$WORK_DIR"
  echo "Infra candidate push race; retrying ${attempt}/5"
  sleep $((attempt * 2))
done

echo "Could not prepare production candidate $CI_BRANCH after retries." >&2
exit 1
