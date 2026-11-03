# Keycloak Vert.x release blocker — 2026-11-03

The complete DEV dependency scan in Jenkins full job 5 refreshed NVD and failed
at source `d5e547e8972faf2b042cf128b0f818708ee3ce1c`. Its backend gate
reported 132 blocking combinations of 12 CVEs and 11 Keycloak Vert.x 4.5.34
artifacts. These are scanner matches, not 132 distinct vulnerabilities; each
advisory's affected component must be evaluated separately. The full failed
report and gate remain archived.

Read-only inspection of the actual DEV and production Keycloak server-main
directories confirmed 4.5.34 core, web and gRPC-server JARs. Their presence
prevents applying an outside-server-runtime classification to these artifacts.
The upstream [core advisory](https://github.com/eclipse-vertx/vert.x/security/advisories/GHSA-h722-h6c2-6j3c),
[web advisory](https://github.com/vert-x3/vertx-web/security/advisories/GHSA-2p39-cr56-w58j)
and [gRPC-server advisory](https://github.com/eclipse-vertx/vertx-grpc/security/advisories/GHSA-4wvq-75mw-q6cg)
identify 4.5.35 as fixed. No new risk acceptance is used.

The candidate aligns the twelve Vert.x artifacts in the existing Keycloak
server and provider closure to 4.5.35 in both the Maven rebuild and Gradle
security inventory. It manages those coordinates individually instead of
importing a BOM that also changes unrelated libraries. The build verifies
embedded Maven metadata and checksums for the entire packaged family before
the existing runtime SHA-256 and Netty checks. It keeps the Keycloak 26.8.1
base and the existing Netty version; these source choices are not yet evidence
of a compatible or deployed image.

The verifier accepted all twelve official 4.5.35 JARs and rejected an old
embedded version, an incomplete set and a duplicate in local fixture checks.
The local Maven graph retained 370 runtime artifacts and changed only the
twelve Vert.x coordinates; Gradle serverRuntime also resolved all twelve at
4.5.35. The focused Gradle verifier test, Maven package and both packaged
Vert.x/Netty verifiers passed. Of 354 locally packaged server-main JARs, the 341 non-Vert.x,
non-platform-native JAR hashes match both live environments; the remaining
non-Vert.x JAR is the expected macOS versus Linux native Brotli classifier.
Fresh exact-source full and Keycloak module security scans, a native image and
provider tests, native dependency comparison, actual DEV authentication and lesson
entry, session continuity, native memory/rollout checks, production backup and
schema gates, and a compatible rollback remain required. Do not promote a
scanner-only change while the running Keycloak image remains on 4.5.34.
