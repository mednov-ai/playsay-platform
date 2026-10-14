# Keycloak upgrade candidate — 2026-10-14

The owner authorized delivery of the current near-term scheduling hotfix and Keycloak upgrade to DEV and PROD. This source candidate aligns all provider SPI dependencies to 26.8.1 and pins the official multi-architecture runtime to `sha256:79c623a22abacf3fe6c00a5fb30f5b7843d717b234033b80995891c06116d244`. It does not change provider logic, issuer, realm, credentials, theme or PostgreSQL engine.

## Verified candidate evidence

- Standalone Java 21/Gradle 8.14.4 provider clean/test/jar: 2 tests, zero failures; 12 CI security contract tests also passed.
- Linux amd64 image build and 16 local runtime checks: PostgreSQL upgrade/restart, existing subject/credential metadata, pre-upgrade refresh session, password/PKCE and lesson assertion/replay, desktop/mobile theme and restore of the pre-upgrade backup to the old image. Local tests used 1100 MiB under ARM64-host amd64 emulation, not native deployment at the chart's 900 MiB limit.
- Fresh OWASP 13.0.0 provider dependency closure plus build-logic scan `run.9g7ruFHs`, successful advisory update on 2026-10-14 after removing the old Netty approval: provider zero blocking/accepted findings; build-logic 24 exact accepted Kotlin findings, zero blockers. This is `passed-with-accepted-risks`, not complete container OS or admin JavaScript clearance.
- Official runtime inventory has Netty 4.1.138.Final; the old CVE-2026-62380 is absent in the candidate report and its runtime version is above the vendor's fixed 4.1.137 threshold. The expired CVE-2026-62380 exception is removed in this candidate after these specific remediation checks; the historical raw findings and renewal review remain retained. This does not remediate or accept the additional 4.1.139 security fixes.

## Publication gate still open

[Netty 4.1.139.Final](https://github.com/netty/netty/releases/tag/netty-4.1.139.Final) recommends additional security fixes in runtime components present in the candidate (including HTTP, HTTP2, handler, DNS and SOCKS). At review the linked advisory details were not publicly accessible and assigned CVE/severity details were unavailable. Do not invent CVE IDs, classify these as false positives, imply the old exception accepts them, or declare all runtime security resolved from the provider scanner alone. Review a compatible coordinated fix or wait for a fixed official Keycloak release before publication; any new risk acceptance must be a separate exact owner decision.

Native CI/DEV startup at 900 MiB, actual registration-service lesson assertion and disposable registration/email/reset, virtual Passkey regression and both-origin production acceptance are required for the final candidate. The numeric release remains incomplete; neither the local tests nor the delivery authorization proves these gates.

## Delivery and rollback

Use the current infrastructure runbook and exact accepted DEV SHA for the numeric candidate. Refresh protected database backups, all-workload schema convergence and zero active lesson/connection/snapshot-queue gates before GitOps promotion. Keycloak database rollback requires the verified pre-upgrade backup; reverting only the image is not a proven schema downgrade. Preserve the PostgreSQL engine/PVC and current realm/issuer/credential metadata. Record immutable image/source metadata, runtime health and authenticated acceptance separately, clean only synthetic fixtures and verify both release heads in remote develop after delivery.

Sources: [Keycloak 26.8.1 release](https://github.com/keycloak/keycloak/releases/tag/26.8.1), [upgrade guide](https://www.keycloak.org/docs/latest/upgrading/index.html), [previous Netty advisory](https://github.com/netty/netty/security/advisories/GHSA-cc6x-ffm5-83wf). Full nonsecret local evidence is under `hotfix-results/near-term-scheduling-20261013/reports/`, including `keycloak2681-upgrade-review.json` and the dependency scanner reports under the isolated candidate build directory.
