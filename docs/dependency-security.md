# JVM dependency security

Honey School uses OWASP Dependency-Check 13.0.0 to check resolved JVM dependencies before image publication. This policy covers every Java/Kotlin module in the backend settings, including internal contracts, shared/test libraries and the Keycloak authenticator, and separately covers the included `build-logic` build. Node packages, container OS packages and source-code security analysis are separate concerns.

## Coverage and gate

`scripts/ci/check-jvm-dependencies.sh` is the supported entry point. The shared Gradle init script in `backend/gradle/dependency-security.init.gradle` applies the plugin in an isolated classloader so application plugin dependencies cannot replace scanner dependencies. Normal test/package commands are unaffected; every checked-in JVM Jenkins publication path explicitly runs the security entry point first. Adding only a dependency to `check` would not cover those pipelines.

The full entry point discovers JVM projects instead of maintaining an allowlist. A module selector scans the selected project and recursively referenced project dependencies, plus build-logic. Every resolvable configuration is included, covering compileOnly through compileClasspath, runtime, test and tool dependencies; buildscript classpaths are also scanned. Inventory resolution is strict and accounts for empty configurations. Included builds are scanned explicitly rather than assumed to participate in the backend aggregate.

An unsuppressed CVSS score >= 7.0 fails verification unless an explicit, unexpired risk acceptance covers the exact CVE, Maven PURL/version and build/module. Lower-severity and unscored findings remain in reports for review. Dependency resolution errors, advisory update failures and analysis errors fail verification; they are not a clean scan. There is no CI bypass or broad suppression baseline. Confirmed vulnerabilities with compatible fixes are remediated regardless of severity. Unavailable or incompatible fixes remain documented as unresolved; only an explicit bounded owner acceptance may temporarily permit release.

## Temporary accepted risks

The project owner authorized release on 2026-09-08 while awaiting compatible fixes for CVE-2026-53914 (Kotlin tooling) and CVE-2026-62380 (Keycloak Netty). `backend/gradle/dependency-security-accepted-risks.json` lists only the already scanned package versions and build/module scopes, with owner, approval, reason, evidence and expiry **2026-10-08 00:00 UTC**. A changed version, new module scope or different CVE is not automatically accepted. No automatic renewal is permitted. Check upstream releases during dependency maintenance and release preparation; replace the affected dependency and remove its exception when a compatible fix is verified.

These are unresolved accepted risks, not false positives. Raw OWASP HTML/JSON still contain them. The required `dependencySecurity` aggregate enforces the CVSS >= 7 threshold after successful analysis, strict report completion and exact acceptance matching. The scanner's built-in finding threshold is delegated to this aggregate (11 internally); analysis errors still fail at the scanner. Calling `dependencyCheckAnalyze` alone is not publication verification. `gate.json` records the threshold, policy hash, accepted and blocking findings; the runner reports `passed-with-accepted-risks` whenever an exception was used. Expired or malformed policy cannot silently allow release. The policy file participates in existing all-JVM affected-target routing.

## Data and reports

The runner uses a unique writable database per invocation and refreshes it before any analysis. An optional cache seed is copied, never opened concurrently for writing. With a key it uses the NVD API; without one it uses the official NVD JSON 2.0 feeds and rejects modified-feed metadata older than 48 hours or dated in the future. Dependency-Check keeps the KEV analyzer enabled and passes `kev.url` to the update task with the CISA-published GitHub mirror by default to avoid CI egress blocks on `www.cisa.gov`; set `DEPENDENCY_SECURITY_KEV_URL` only to another approved CISA mirror when operating policy requires it. Update time and feed provenance accompany the reports. CI binds a Jenkins secret; local runs accept an environment variable or ignored raw key file. Keys are never passed as command arguments, sourced as code or written to reports.

Reports are under `backend/build/reports/dependency-security/<run-id>/`: status/revision/timestamps, build-logic and backend `coverage.json`, and HTML/JSON scanner reports per project. `inventory` explicitly reports `inventory-only`; it does not establish vulnerability clearance. Jenkins must archive nonempty reports during the successful security stage before publication, and archives available failure reports in `post/always`. Report directories and files are readable across the Gradle and Jenkins container UIDs; advisory databases retain private permissions. Missing final status or a nonzero exit means an incomplete/failed run, never clearance. Local outputs and databases stay under ignored build directories.

## Remediation evidence

The current local remediation record is [2026-09-08 evidence](security/dependency-remediation-2026-09-08.md), including remaining blockers.

For each confirmed finding, record advisory ID, package coordinates, direct/transitive dependency path, modules/configurations, original and fixed resolved versions, upstream advisory link and post-update verification. Prefer coordinated maintenance BOM/framework updates. Validate API contracts, affected tests and packaging after updates. For Keycloak compileOnly findings, check the pinned server runtime; changing provider compilation dependencies alone does not remediate the deployed server.

False-positive suppressions, if needed, require exact finding/artifact scope, evidence, an owner and expiry. They must not hide a confirmed vulnerability. The checked-in suppression file contains exact Maven PURL/CVE entries for OpenTelemetry Go/JavaScript misidentification and the observed Spring Framework CVEs misassigned to the exact Gradle dependency-management plugin version. Additional exact entries distinguish Spring Tools IDE from Boot loader tools and reject incorrect Kotlin pre-1.4.21 version matching. Every entry has an owner, supporting evidence and UTC expiry; the runner rejects broad or undocumented entries. Native .NET and JavaScript analyzers are disabled because this verification covers JVM dependencies, including JAR contents, rather than other ecosystems.

Operational commands, credentials provisioning and CI activation procedures belong to [the infra runbook](../../playsay-infra/docs/runbook.md#jvm-dependency-security). Local implementation does not execute remote CI or deploy dependency updates.

## Sources

- [OWASP Gradle plugin](https://github.com/dependency-check/dependency-check-gradle)
- [Scanner configuration](https://dependency-check.github.io/DependencyCheck/dependency-check-gradle/configuration.html)
- [Official feed support and caveats](https://dependency-check.github.io/DependencyCheck/data/mirrornvd.html)
