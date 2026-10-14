# JVM security policy review — 2026-10-14

The owner instructed: «Продлеваем исключение на месяц, если еще нет исправлений». This renews CVE-2026-53914 only, from 2026-10-14 through **2026-11-14 00:00 UTC (03:00 MSK)**. The previous exact Maven PURL, version and build/module matrix is unchanged. The unresolved risk remains visible in raw scan findings and is not classified as a false positive. This policy decision does not authorize production promotion.

## Compatible fix check

- [Kotlin 2.4.20](https://github.com/JetBrains/kotlin/releases/tag/v2.4.20) is published and already used by the application compiler/plugins. The [JetBrains advisory](https://www.jetbrains.com/privacy-security/issues-fixed/) identifies the fixed Kotlin line.
- [Latest Detekt release alpha.6](https://github.com/detekt/detekt/releases/tag/v2.0.0-alpha.6) still builds against Kotlin **2.4.10**, below the fixed line. Its [supported compiler binding](https://detekt.dev/changelog-2.0.0/) must be preserved. It therefore does not clear this finding. The previous alpha.6 trial also failed existing lint; see the September remediation record.
- API CI **#201**, source `75c3060d2a8cb0f5d78e2d9be19071fd9c4bc2e6`, completed a fresh authenticated NVD scan (`run.JHOtdNRj`) on 2026-10-14. Backend gate contained 89 Kotlin blockers; build-logic contained 24 Kotlin blockers. Every Kotlin finding matches the existing exact accepted matrix. The updated application compiler did not replace the separate Gradle/Detekt/ABI tooling dependencies. No compatible complete toolchain fix was established; no compiler forcing or lint baseline was introduced.

## Independent false-positive review

The remaining 12 build-logic blockers in API #201 are the existing wrong-product matches: eleven Spring Framework advisories assigned to Gradle dependency-management-plugin 1.1.7, and CVE-2022-31691 assigned to Spring Boot loader-tools 4.0.8. Their exact existing rules had expired on October 8.

Fresh official Maven JAR inspection on October 14 verifies dependency-management-plugin has no `org/springframework/` implementation classes; loader-tools has no IDE editor classes. [The plugin source](https://github.com/spring-gradle-plugins/dependency-management-plugin/tree/v1.1.7) and [Spring's CVE-2022-31691 advisory](https://spring.io/security/cve-2022-31691/) distinguish these products. Only these two already recorded exact rules are revalidated until November 14; no artifact or advisory IDs are added.

| Artifact | SHA-256 |
| --- | --- |
| dependency-management-plugin-1.1.7.jar | `9e885eec4fc0b7152a7bba1664004085c6663a3c93b0a62463be7308b005be4c` |
| spring-boot-loader-tools-4.0.8.jar | `260e52aa495965a5833f7568d26f80094bcf4eb73eb7a38f748338ebd72493b8` |

CVE-2026-62380 / Keycloak Netty is not renewed by this Kotlin decision. Other expired suppressions, new findings, changed versions/scopes, incomplete analysis and advisory refresh failures continue to block. The mandatory full rescans retain raw HTML/JSON, inventories, source revision, status and gate evidence; a successful accepted-risk result must be labelled `passed-with-accepted-risks`.

## Validation

Pending fresh CI after policy integration. The earlier failed scan is diagnostic evidence and is not clearance for the renewed policy.
