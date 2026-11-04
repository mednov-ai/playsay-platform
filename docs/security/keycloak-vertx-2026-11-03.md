# Keycloak Vert.x release blocker — 2026-11-03

On 2026-11-04 the exact-image scan of Jenkins Keycloak #28 found six
additional blocking matches in its unpublished image: the RHEL system CA
bundle, the Java 21 runtime, SQLite libraries and Guava 33.6.0-jre. The raw
image findings are retained in the infra stack-upgrade security evidence;
the JVM dependency gate's pass did not clear this image scan. Publication and
DEV rollout did not run.

The candidate now pins the newer official Keycloak 26.8.1 image index
`sha256:3f3c5f8e03c614774b4bd9173b88391fefa4153bfc010d8012d59ad825377332`.
Its image label reports the same Keycloak revision as the previous official
image and a later rebuild date. The server's Maven packaging and Gradle
security inventory both resolve Guava 33.7.2-jre, whose upstream release
addresses CVE-2026-102554; packaging fails if a second Guava JAR appears.
Local provider tests and the Netty, Vert.x and runtime inventory verifiers
passed. These changes are **not** a clearance of the OS/JDK findings: the
new exact CI image and its full dependency and image scans still need to pass.

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
The exact-release full security stage and Keycloak module job 25 subsequently
passed under the existing scoped policy. The full-scan-only job was stopped
after that successful stage and is not a successful full build. The verified
release image contains all twelve 4.5.35 JARs; its remaining server JARs match
the accepted DEV runtime. DEV provider authentication, lesson entry and
pre-existing session continuity were exercised on both origins after deployment.
The changed DEV pod became ready with no new restart.

Before production promotion, four protected database backups
passed checksum and archive checks, the Keycloak backup was restored in a
temporary isolated database, and all seven exact-release schema status checks
reported no pending changes. Production `release/01.007.24` was then deployed
through GitOps in a verified lesson-safe window. Keycloak ran the verified
4.5.35 image with zero pod restarts; two sessions created before rollout were
refreshed afterwards. Its 237 changelog rows matched the protected pre-rollout
backup. Native one-time lesson entry and PKCE passed on both production origins.
Use only the compatible GitOps rollback described in the infrastructure
runbook; a live rollback exercise has not been performed.
