#!/usr/bin/env sh
set -eu

node --test scripts/ci/*.test.mjs

for script in scripts/ci/*.sh; do
  sh -n "$script"
done

for script in scripts/smoke/*.sh; do
  bash -n "$script"
done

for script in scripts/smoke/*.mjs; do
  node --check "$script"
done

sh scripts/ci/backend-architecture-report.sh --verify-clones >/dev/null
