#!/bin/sh
set -eu

[ "$#" = 3 ] && [ -s "$1" ] && [ -s "$2" ]
[ "${IMAGE_REPOSITORY:-}" = ghcr.io/mednov-ai/playsay-keycloak ]
[ "${CI_BRANCH:-}:${DEPLOY_TO_DEV:-}:${DEPLOY_TO_PROD:-}:${SECURITY_SCAN_ONLY:-false}" = release/01.008.00:false:true:false ]
repo_git() { git -c safe.directory="$PWD" "$@"; }
[ "$(repo_git rev-parse HEAD)" = "${GIT_COMMIT:-}" ]
repo_git merge-base --is-ancestor dda419cfb3908ba7b2e5a5669517687430217c3a HEAD
[ "$(repo_git rev-parse HEAD:backend/keycloak-lesson-authenticator)" = e350f463f465501a29f9e1618c96d52b013dac3b ]
# The component tree pins the reviewed base image. Verify Red Hat's CA fix in
# this build's actual package inventory before classifying the Java finding.
convert() {
  trivy convert --config '' --ignorefile '' --format template --template "$1" --output "$2" "$3"
}
convert '{{range .}}{{if and (eq .Class "os-pkgs") (eq .Type "redhat")}}{{range .Packages}}{{if eq .Name "ca-certificates"}}{{printf "%s|%s|%s\n" .Version .Release .Arch}}{{end}}{{end}}{{end}}{{end}}' "$3.ca-rpm" "$1"
[ "$(cat "$3.ca-rpm")" = '2026.2.92_v9.0.319|90.3.el9_8|noarch' ]
convert "@$(dirname "$0")/classroom-keycloak-findings.tpl" "$3" "$2"
awk -F '|' '
  BEGIN {
    accepted["CVE-2026-119373"]=accepted["CVE-2026-119374"]=accepted["CVE-2026-119379"]=accepted["CVE-2026-119586"]="sqlite-libs|3.34.1-11.el9_8"
    accepted["CVE-2026-91403"]="java-21-openjdk-headless|1:21.0.13.1.2-1.2.el9"
  }
  NF != 6 || $1 != "os-pkgs" || $2 != "redhat" || $3 != "HIGH" ||
    !($4 in accepted) || accepted[$4] != $5 "|" $6 || seen[$4]++ { bad=1 }
  END { if (bad || NR == 0) exit 1 }
' "$3"
