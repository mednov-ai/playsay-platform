#!/usr/bin/env sh
set -eu

node --test scripts/ci/*.test.mjs

for script in scripts/ci/*.sh; do
  sh -n "$script"
done

./scripts/ci/validate-smoke-syntax.sh

sh scripts/ci/backend-architecture-report.sh --verify-clones >/dev/null
