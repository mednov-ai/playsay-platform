#!/usr/bin/env sh
set -eu

for script in scripts/smoke/*.sh; do
  sh -n "$script"
done

for script in scripts/smoke/*.mjs; do
  node --check "$script"
done
