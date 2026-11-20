#!/bin/sh
set -eu

[ "$#" -eq 2 ] && [ -s "$1" ] || exit 1
[ "${IMAGE_REPOSITORY:-}" = ghcr.io/mednov-ai/playsay-keycloak ]
[ "${DEPLOY_TO_PROD:-}" = false ]
candidate=70048770afd32a652f8e2312769fc6ebf7a970fc
previous_develop=7f5562f2d18969dd314270dfbb9e014f489a0a93
repo_git() { git -c safe.directory="$PWD" "$@"; }
[ "$(repo_git rev-parse HEAD)" = "${GIT_COMMIT:-}" ]
[ "$(repo_git rev-parse HEAD:backend/keycloak-lesson-authenticator)" = e350f463f465501a29f9e1618c96d52b013dac3b ]
repo_git merge-base --is-ancestor "$candidate" HEAD
case "${CI_BRANCH:-}:${SECURITY_SCAN_ONLY:-false}:${DEPLOY_TO_DEV:-}" in
  security-check/harden-classroom-and-materials:true:false) ;;
  develop:false:true)
    # Only the reviewed merge into the original develop tip may use the DEV decision.
    [ "$(repo_git rev-parse HEAD^1)" = "$previous_develop" ]
    [ "$(repo_git rev-list --parents -n 1 HEAD | awk '{print NF}')" -eq 3 ]
    repo_git merge-base --is-ancestor "$candidate" HEAD^2
    [ "$(repo_git rev-parse 'HEAD^{tree}')" = "$(repo_git rev-parse 'HEAD^2^{tree}')" ]
    ;;
  *) exit 1 ;;
esac

trivy convert --config '' --ignorefile '' --format template \
  --template "@$(dirname "$0")/classroom-keycloak-findings.tpl" --output "$2" "$1"
# Reject another severity, OS, version, duplicate row or additional finding.
awk -F '|' '
  BEGIN {
    expected["CVE-2026-91403"]="java-21-openjdk-headless|1:21.0.13.1.2-1.2.el9"
    expected["CVE-2026-119373"]=expected["CVE-2026-119374"]=expected["CVE-2026-119379"]=expected["CVE-2026-119586"]="sqlite-libs|3.34.1-11.el9_8"
  }
  NF != 6 || $1 != "os-pkgs" || $2 != "redhat" || $3 != "HIGH" ||
    !($4 in expected) || expected[$4] != $5 "|" $6 || seen[$4]++ { bad=1 }
  END { if (bad || NR != 5) exit 1 }
' "$2"
