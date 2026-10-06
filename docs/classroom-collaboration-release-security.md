# Classroom collaboration recovery release security

The owner clarified on 2026-10-06: «Не заблокирован почитай agents.md». The existing CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm exception therefore applies to this hotfix candidate and its develop merge-back, with the exact packages and original expiry recorded in `security/node-dependency-security-accepted-risks.json`. The risk remains unresolved; it concerns controlled build processing and is not copied into the static nginx runtime.

Fresh full frontend audit retains only the accepted advisory across five exact packages. Compatible fixes update postcss-selector-parser to 7.1.6 and source-map-js to 1.2.2; the collaboration-service full audit has no findings. Raw reports are preserved in the operator evidence directory `hotfix-results/collaboration-recovery-20261006/`. Gate: `passed-with-accepted-risks`. Fresh CI reports remain required. No JVM code or dependency scope is changed. Production promotion is separately pending.
