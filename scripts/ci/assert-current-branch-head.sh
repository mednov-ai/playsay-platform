#!/usr/bin/env sh
set -eu

: "${PLATFORM_REPO:?Missing PLATFORM_REPO}"
: "${CI_BRANCH:?Missing CI_BRANCH}"
: "${GIT_COMMIT:?Missing GIT_COMMIT}"

case "$CI_BRANCH" in
  develop|codex/*|feature/*|hotfix/*|release/[0-9]*.[0-9]*.[0-9]*) ;;
  *)
    echo "Branch-head deployment guard does not support branch: $CI_BRANCH" >&2
    exit 1
    ;;
esac

remote_head="$(
  git ls-remote --exit-code --heads "$PLATFORM_REPO" "refs/heads/$CI_BRANCH" |
    awk 'NR == 1 { print $1 }'
)"

if [ "$remote_head" != "$GIT_COMMIT" ]; then
  echo "Refusing a stale GitOps update: $CI_BRANCH now points to ${remote_head:-missing}, build source is $GIT_COMMIT." >&2
  exit 42
fi

echo "Branch-head guard passed for $CI_BRANCH at $GIT_COMMIT."
