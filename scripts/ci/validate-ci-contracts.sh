#!/usr/bin/env sh
set -eu

node --test scripts/ci/*.test.mjs

for script in scripts/ci/*.sh scripts/smoke/*.sh; do
  sh -n "$script"
done

for script in scripts/smoke/*.mjs; do
  node --check "$script"
done
