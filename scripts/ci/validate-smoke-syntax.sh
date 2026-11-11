#!/usr/bin/env sh
set -eu

for script in scripts/smoke/*.sh; do
  bash -n "$script"
done

for script in scripts/smoke/*.mjs; do
  node --check "$script"
done

for test in scripts/smoke/*.test.mjs; do
  if [ -f "$test" ]; then
    node --test "$test"
  fi
done
