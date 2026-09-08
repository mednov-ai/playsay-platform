# JVM dependency remediation — 2026-09-08

This is local verification of the working tree, including preserved pre-existing changes. It does not establish deployment or remote Jenkins verification. The scans below initially blocked publication. The later owner decision recorded at the end temporarily accepts the two known unresolved risks for exact versions/scopes.

## Changes

| Dependency group | Before | Prepared version | Reason / upstream evidence |
| --- | --- | --- | --- |
| Spring Boot convention/plugin | 4.0.2 | 4.0.8 | Coordinated maintenance update of Spring Framework, Security, Netty, PostgreSQL, Jackson and logging dependencies; [Boot BOM](https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-dependencies/4.0.8/spring-boot-dependencies-4.0.8.pom) |
| Kotlin application compiler/plugins and Spring runtime BOM property | 2.2.21 | 2.4.20 | [JetBrains security fixes](https://www.jetbrains.com/privacy-security/issues-fixed/), CVE-2026-53914; does not replace Gradle/Detekt's embedded compilers |
| Kotlin architecture test library | 2.2.21 | 2.4.20 | Align test library with application Kotlin |
| Detekt | 2.0.0-alpha.1 | Retained pending compatible fix | alpha.6 trial introduced 117 lint findings on the same code, while the previous toolchain passes. It still embeds vulnerable compiler 2.4.10. No blanket lint baseline was added; [release compatibility](https://detekt.dev/changelog-2.0.0/) |
| Tomcat BOM property | Boot default | 11.0.25 | Maintenance fix beyond Boot 4.0.8's 11.0.24; [Tomcat 11 security](https://tomcat.apache.org/security-11.html) |
| Async HTTP Client | 2.12.4 | 2.15.0 | CVE-2026-45300; retain compatible 2.x API |
| jose4j | 0.7.9 | 0.9.6 | CVE-2023-31582, CVE-2023-51775, CVE-2024-29371; controlled fixture verifies vulnerable/fixed behavior |
| Build-logic Jackson Kotlin/JSR310 | 2.20.0 | 2.21.5 | Fixed maintenance line; build-tool databind resolves independently |
| Build-tool Jackson databind constraint | resolved 2.22.0 after initial updates | 2.22.2 | [CVE-2026-54515](https://github.com/FasterXML/jackson-databind/security/advisories/GHSA-5jmj-h7xm-6q6v), affected 2.22.0 fixed in 2.22.1+ |
| Build-tool HttpClient5 / HttpCore5 + H2 | transitive vulnerable versions | 5.6.4 / 5.4.3 | CVE-2026-64607, CVE-2026-71290 / CVE-2026-54399, CVE-2026-54428; [HttpComponents security](https://hc.apache.org/security.html) |
| Build-tool Commons Lang | transitive vulnerable version | 3.20.0 | [CVE-2025-48924](https://commons.apache.org/proper/commons-lang/security.html) |
| Build-tool Handlebars | 4.3.1 | 4.5.4 | Old JAR embeds relocated Commons Lang 3.12.0 classes; changing external Lang alone cannot fix that. [4.5.4 POM](https://repo.maven.apache.org/maven2/com/github/jknack/handlebars/4.5.4/handlebars-4.5.4.pom) externalizes patched Lang 3.20.0 |
| Keycloak provided/test libraries and image | 26.7.1 | 26.7.3 | Coordinated provider SPI and immutable image update; provider imports the matching Keycloak parent BOM |

Kotlin 2.4.20 requires an exhaustive branch for the `InetAddress` private-address predicate. The fallback returns `true`, rejecting an unknown address type. Existing URL-import tests pass.

## Keycloak runtime evidence

The public `linux/amd64` manifest was read from Quay and its Keycloak filesystem layer downloaded and SHA-256 verified. No container or remote host was started. [Recorded JAR inventory](keycloak-runtime-2026-09-08.json) identifies the exact index, platform manifest and layer digest.

The 26.7.3 image contains Protobuf 4.33.2 and Jackson databind 2.21.5. The earlier unaligned provider graph selected Protobuf 3.25.1 through Keycloak services → Quarkus OpenTelemetry → Vert.x gRPC → gRPC Protobuf. Importing the server's parent BOM aligns compilation/tests with the actual server; the old provider graph was not evidence that the new image shipped Protobuf 3.25.1.

The image really contains Netty 4.1.136.Final, including `netty-codec-socks`. CVE-2026-62380 is fixed in 4.1.137.Final (or 4.2.17.Final). Replacing provider compileOnly coordinates would not fix those server JARs. A fixed upstream Keycloak image, or a separately validated rebuilt server dependency stack, is required before this runtime can be declared clear. No runtime suppression was added.

## Final scan

The complete fresh-data rescan `run.QXWo5F1g` finished with 19 reports and exit 1. Exactly two unique advisory IDs remain: CVE-2026-53914 (Kotlin tooling) and CVE-2026-62380 (Keycloak Netty), across 51 advisory/coordinate pairs. The gate remains blocked. The reduction from 210 initial IDs includes verified false positives and non-JVM analyzer scope changes as well as dependency updates; it must not be described as 208 confirmed vulnerabilities fixed. [Final coordinates, scores, module/configuration locations and dependency paths](dependency-rescan-2026-09-08.json).

## Remaining toolchain findings

CVE-2026-53914 (reported CVSS 3.1: 9.8) remains on Kotlin before 2.4.20 in Gradle 8's embedded Kotlin 2.0.21, Detekt alpha.1's supported compiler 2.2.20 (the latest alpha.6 still uses vulnerable 2.4.10) and the Kotlin ABI compatibility tooling configuration pinned to 2.4.0. The newer application compiler does not replace these separate configurations. The supported Detekt compiler binding remains intact; blindly forcing a different compiler would not establish compatibility. A coordinated Gradle/Detekt/ABI-tooling remediation is still required. The reports retain all matching Kotlin coordinates, including library-only CPE matches that need further component-level triage.

## False positives

Only exact Maven PURL + observed advisory IDs are suppressed, owned by Honey School platform maintainers and expiring 2026-10-08 UTC:

- Java OpenTelemetry artifacts misidentified as Go/JavaScript components.
- Gradle dependency-management-plugin 1.1.7 misidentified as Spring Framework 1.1.7. The plugin contains no Spring Framework implementation classes.
- Spring Boot loader-tools 4.0.8 misidentified as Spring Tools IDE YAML editors for [CVE-2022-31691](https://spring.io/security/cve-2022-31691/).
- CVE-2020-29582 incorrectly assigned to exact Kotlin versions newer than its fixed version 1.4.21. CVE-2026-53914 is deliberately unaffected.

The Handlebars embedded Commons Lang finding was genuine and was resolved by upgrading the containing JAR, not suppressed.

## Verification evidence

- Initial complete scan: `run.O4PMnnVY`, 18 backend modules + build-logic (19 reports), 210 unique advisory IDs before triage. [Baseline advisory index](dependency-baseline-2026-09-08.json). This count includes false positives and is not a count of confirmed vulnerabilities.
- Baseline resolved dependency-edge inventories: `run.bhQ8nrc5`; actual module selection and standalone Keycloak inventories also passed.
- Final full refresh and scan: `run.QXWo5F1g`, all 19 reports, 18 discovered backend modules plus build-logic; both remaining advisories are unsuppressed and the gate fails. Full no-key bootstrap took about 10 minutes after the incremental feed failure.
- Intermediate complete scan: `run.W2a1YeHG`, 19 reports. This precedes final Handlebars/Jackson/BOM corrections and suppression refinements.
- Incremental NVD refresh `run.YT6Lggw7` failed with HTTP 404 for the official modified feed and correctly stopped without clearance. Use the NVD API key, or retry a complete bootstrap without a seed. Do not reuse its failed status as evidence of a successful scan.
- [Controlled fixture results](dependency-security-fixtures-2026-09-08.json): vulnerable/fixed/expired cases, automatic new-module discovery, selected consumer plus upstream compileOnly and test dependencies. No intentionally vulnerable dependency was added to application sources.
- CI contract tests: 46 passed, 1 skipped (47 total); no remote CI executed.
- Detekt alpha.6 trial: 117 findings; an isolated copy with the previous dependency toolchain passes. After retaining alpha.1, all nine `detektMain` tasks also pass with the updated application dependencies. The existing lint policy/baselines were preserved.
- Full backend test/contract/package invocation executed with Java 21 / Gradle 8.14.4, one worker and 2 GiB Gradle heap. 729 backend tests passed, 1 was skipped; all nine bootJars plus provider JAR and internal contract verification passed; Detekt findings are tracked separately. An earlier default-heap invocation failed from memory exhaustion and was not accepted as verification.

Raw reports and coverage manifests remain in ignored `backend/build/reports/dependency-security/<run-id>/`. Git integration, Jenkins credential provisioning and actual CI execution, Keycloak image startup/build, and deployment remain unverified and were not performed.

## Latest Keycloak and authenticated NVD verification

On 2026-09-08 the official downloads page, GitHub latest release and Maven metadata all identify **26.7.3** as the latest stable Keycloak. That version is already pinned by the prepared Dockerfile and provider dependency/BOM declarations; no newer stable version was substituted.

The user-supplied NVD API key was validated with HTTP 200 without printing it. A new authenticated scan (`run.GroaBcMX`) refreshed through the NVD API and produced reports for standalone Keycloak and build-logic. It still fails on CVE-2026-62380 (Netty 4.1.136.Final, including the affected SOCKS codec) and CVE-2026-53914 (Kotlin tooling). This selected scan supplements the earlier complete 19-report scan.

Standalone provider tests and JAR packaging passed. The SHA-256-verified Keycloak image layer was unpacked into an isolated temporary directory; the provider JAR was installed, `kc.sh build` succeeded, and the server started on localhost with a fresh temporary dev-file database. Master-realm OIDC discovery returned HTTP 200; the process was then stopped. This verifies JVM startup/augmentation on the local Java 21 host, not a Docker build, Linux-container execution, full lesson-login acceptance or deployment. [Machine-readable evidence](keycloak-latest-verification-2026-09-08.json).

The latest stable upstream image therefore does not clear the Netty finding. A fixed upstream release or a separately validated server dependency rebuild remains necessary.

## Owner-approved temporary release exception

On 2026-09-08 the project owner explicitly authorized release with a temporary exception for the two known CVEs while awaiting compatible upstream fixes. This supersedes the earlier release-blocked disposition above for the exact recorded versions/scopes only; it does not supersede the vulnerability evidence. The manifest `backend/gradle/dependency-security-accepted-risks.json` expires at 2026-10-08 00:00 UTC and records the approval, owner, rationale and exact Maven PURLs plus build/module scopes. Findings remain in raw reports; `gate.json` separately records accepted risks. New findings, unlisted versions/scopes, expired acceptance and all analysis/data failures remain blocking. No Git operations, remote CI or deployment are authorized by this policy exception alone.

Verification of the accepted-risk gate: full authenticated scan `run.MJIupxKX` produced all 19 reports and exited 0 with `passed-with-accepted-risks`. Raw findings still contain both CVEs; `gate.json` contains no unmatched blockers. Seven real Gradle/OWASP fixture cases passed: unapproved failure, exact accepted pass, expired failure, wrong-version failure, wrong-module failure, new-finding failure and wildcard rejection. CI runner/routing tests passed (22 focused tests, including accepted-risk status); the earlier full CI suite passed 46 with one skipped. The first scan attempt correctly failed on duplicate generated Gradle metadata; its generated output directory was preserved and regenerated before the successful run. [Accepted-risk verification](accepted-risk-verification-2026-09-08.json), [fixture evidence](accepted-risk-fixtures-2026-09-08.json).
