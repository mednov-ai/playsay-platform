#!/usr/bin/env sh
set -eu

# Compatibility entry point for older Jenkins jobs.
DEPLOY_ENVIRONMENT=dev
export DEPLOY_ENVIRONMENT
exec "$(dirname "$0")/update-environment-image.sh"
