#!/bin/sh
set -eu
if [ "${1:-}" = start ]; then
  shift
  exec /opt/keycloak/bin/kc.sh start --optimized "$@"
fi
exec /opt/keycloak/bin/kc.sh "$@"
