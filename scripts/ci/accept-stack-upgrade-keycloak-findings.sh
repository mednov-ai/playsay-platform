#!/usr/bin/env sh
set -eu

# Owner-approved exact finding matrix. DEV scope is unchanged; the one-time
# production scope is only release/01.007.25 with the reviewed Keycloak tree.
[ "${IMAGE_REPOSITORY:-}" = 'ghcr.io/mednov-ai/playsay-keycloak' ]
case "${CI_BRANCH:-}" in
  codex/hotfix-stack-upgrade-20261103)
    [ "${DEPLOY_TO_DEV:-}" = true ]
    [ "${DEPLOY_TO_PROD:-}" = false ]
    ;;
  release/01.007.25)
    [ "${DEPLOY_TO_DEV:-}" = false ]
    [ "${DEPLOY_TO_PROD:-}" = true ]
    [ "$(git rev-parse HEAD:backend/keycloak-lesson-authenticator)" = b5310ef435edb065599d7655003de0355efc0b45 ]
    ;;
  *) exit 1 ;;
esac
[ "${SECURITY_SCAN_ONLY:-false}" = false ]
[ "$#" -eq 2 ]
[ -s "$1" ]
trivy convert --config '' --ignorefile '' --format template \
  --template "@$(dirname "$0")/stack-upgrade-keycloak-findings.tpl" \
  --output "$2" "$1"
[ -s "$2" ]
awk '
  $0 == "os-pkgs|CVE-2026-91403|java-21-openjdk-headless|1:21.0.13.0.9-1.2.el9" { n++; next }
  $0 == "os-pkgs|CVE-2026-119373|sqlite-libs|3.34.1-11.el9_8" { n++; next }
  $0 == "os-pkgs|CVE-2026-119586|sqlite-libs|3.34.1-11.el9_8" { n++; next }
  { bad=1 }
  END { if (!n || bad) exit 1 }
' "$2"
