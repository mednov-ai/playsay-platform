#!/usr/bin/env sh
set -eu

# Validate a release against a resolved production baseline and fresh develop.
repo="$1"
kind="$2"
branch="$3"
source="$4"
base="$5"
integrated="$6"
develop_ref="$7"
base_release="$8"

if ! printf '%s\n' "$branch" | grep -Eq '^release/[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Invalid numeric release branch: $branch" >&2; exit 1
fi
for sha in "$source" "$base" "$integrated"; do
  if ! printf '%s\n' "$sha" | grep -Eq '^[0-9a-f]{40}$'; then
    echo 'Release source values must be full commit SHAs.' >&2; exit 1
  fi
done
fix_number="${branch##*.}"
case "$kind" in
  normal)
    case "$fix_number" in *[!0]*) echo 'A nonzero fix number is a hotfix.' >&2; exit 1 ;; esac
    if ! git -C "$repo" merge-base --is-ancestor "$integrated" "$source"; then
      echo "Release $branch does not contain accepted dev commit $integrated." >&2; exit 1
    fi
    ;;
  hotfix)
    case "$fix_number" in *[!0]*) ;; *) echo 'A zero fix number is a normal release.' >&2; exit 1 ;; esac
    if ! printf '%s\n' "$base_release" | grep -Eq '^release/[0-9]+\.[0-9]+\.[0-9]+$' || [ "${branch%.*}" != "${base_release%.*}" ]; then
      echo 'Hotfix version must stay within the current production release series.' >&2; exit 1
    fi
    if ! awk -v candidate="$fix_number" -v current="${base_release##*.}" 'BEGIN { exit !(candidate + 0 > current + 0) }'; then
      echo 'Hotfix number must follow the current production release.' >&2; exit 1
    fi
    if [ "$integrated" != "$source" ]; then
      echo 'Hotfix integration proof must name the exact release source.' >&2; exit 1
    fi
    if ! git -C "$repo" merge-base --is-ancestor "$base" "$source"; then
      echo 'Hotfix does not descend from the current production source.' >&2; exit 1
    fi
    if [ -n "$(git -C "$repo" rev-list --merges "${base}..${source}")" ]; then
      echo 'Hotfix must not merge other histories after the production baseline.' >&2; exit 1
    fi
    if ! git -C "$repo" merge-base --is-ancestor "$source" "$develop_ref"; then
      echo 'Exact hotfix source is not integrated in current develop.' >&2; exit 1
    fi
    ;;
  *) echo "Unknown release kind: $kind" >&2; exit 1 ;;
esac
