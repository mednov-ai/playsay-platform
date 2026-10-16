# Shared HTML-game library develop delivery — 2026-10-16

Owner instruction: «мерджи в develop проследи за развертыванием». Scope: both develop branches and DEV; production promotion and real production migration remain pending.

Implementation source commits: platform `7cd6afa2`, infra `45783f4`. Three-way port onto platform `1b7384be79d22346d080c7e48dfd0f90b2b2bef0` and infra `62a80a1810e7bc6a85d36ca8ae35d4a8f8760d1a` preserves current session recovery, scheduling, security, Keycloak and environment desired state. Infra PR34 merged as `f1bf7e7c2ef51d99b4eb7152f7ebd3ddde5fa48f`. Original dirty checkouts remain untouched; invalid duplicate remote refs required clean delivery clones.

## Local integration checks

- Selected server suite: 73 cases, 72 passed, one optional external fixture skipped, no failures/errors; Detekt main zero findings.
- Full frontend: 164 files, 932 tests passed. Lint passed. OpenAPI exported from integrated source and client regenerated through project commands.
- Collaboration: 78 tests passed and build passed. SDK: 12 tests passed and build passed.
- Helm lint, guarded migration renders, upload-route and generated API/reference contracts passed.
- Fresh full npm audits: collaboration zero findings; frontend five high advisory nodes in braces/chokidar/fast-glob/micromatch/tailwindcss. They remain raw findings. Exact versions, lock/audit/Dockerfile hashes and outside-server-runtime classification are retained in protected local evidence `delivery-node-gate.json`. The static nginx Dockerfile copies only dist and configuration, with no Node interpreter or node_modules. Owner policy 2026-10-14 applies; no exception is extended or broadened.

Evidence directory: `/Users/evgeniymednov/Documents/Projects/Play&Say/local-results/shared-html-game-library-20261016`. Native CI security, exact-source rollout, PostgreSQL migration, actual library workflows and legacy inventory are recorded after completion. Local checks do not claim authenticated native DEV or production acceptance.

## Delivery routing correction

Initial dispatcher256 stopped before publication on unmapped `contracts/material-game-reference.schema.json`. Added an explicit API/web routing rule and its test. The AJV/YAML validation runs in the web job after frontend dependencies are installed, outside the dependency-free dispatcher contract test glob. Full CI contracts: 60 passed, 3 optional environment fixtures skipped. Native delivery must analyze the original feature range, including collaboration-service. Local rebuilt browser matrix passes all eight combinations.

DEV inventory found 275 legacy HTML assets and 65 historical IN_PROGRESS rows, with zero unexpired access windows. Migration drain now reuses the server access-deadline function including grace/extension and treats unknown end times as active. The regression verifies active/extended blocking and expired-history retention; it does not authorize forcibly completing lessons.

## Native layout regression and correction

Web394 published successfully but its real Sprint5 UI acceptance found the connected material hidden below the visible grid row. The added library controls/error/stage were separate grid items. The correction keeps the Games action in the video header and uses one bounded primary column for material/game/error, retaining the mounted material workspace. Real DEV Keycloak/API/classroom browser checks with candidate static assets confirm teacher and student material surfaces remain visible; screenshots are retained as material-layout-teacher/student.png. This candidate-overlay result is preparatory, not deployed-source acceptance. Focused component tests cover the shared primary column/error placement; build and lint pass. Full deployed UI smoke remains mandatory.

## Full server architecture gate

Native API207 retained 486 cases: three architecture failures, two skips and all remaining functional tests passed. It did not run schema migration or publish an API image. Resolve this by moving prepared SQL and row mapping into repository APIs with private JDBC dependencies (catalog, launch, processing, bounded migration), splitting catalog/material/processing controllers and extracting the legacy upload orchestration from LessonMaterialStore. Transaction ownership, parameter order, row locks, fencing/CAS and failure cleanup are retained. The synthetic database-failure test now checks Spring repository exception translation and its original cause, plus rollback/object cleanup. No guard/threshold/allowlist is weakened.

The corrected local full API suite passes 486 cases (484 passed, one optional external-file fixture skipped and the dedicated OpenAPI exporter skipped in the normal test task; its separate export task passes), with Detekt zero findings. Generated API content remains equivalent. Full frontend again passes 932 cases; the eight browser combinations pass. Migration Job logs expose bounded aggregate outcome/error-code counts, without source IDs or content. The minimized game consumes only its toolbar height inside the shared primary column. Native CI is repeated on the final integrated source before rollout.


## Final native DEV source and security

Runtime source: `de3060983fa0d7d3f79d915b079f6cb6936f39fd` (platform PR65; preceding feature/routing/layout/memory PR61–64 are merged). Dispatcher263 analyzes the full original feature range from `1b7384be79d22346d080c7e48dfd0f90b2b2bef0`, including all five affected modules. A late incremental webhook run262 was stopped before publication because it omitted the original migration range; API209 explicitly detected and successfully executed the required Liquibase Job. API209, web398, vocabulary75 and collaboration59 pass native gates; final keyboard/dispatcher result is recorded below after completion.

Fresh native JVM reports are retained in `native-jvm-security-final.json`: API209 29 archived files/two gates; vocabulary75 19 archived files/two gates; zero blocking findings. The exact active Kotlin acceptance remains bounded to its existing matrix/expiry. No expired Netty exception is renewed. The full web398 audit retains six high dependency nodes (braces3.0.3, chokidar3.6.0, fast-glob3.3.3, micromatch4.0.8, tailwindcss3.4.19 and tailwindcss-animate1.0.7); lock metadata changes contain zero package-version changes. `native-node-gate-final.json` records hashes and `passed-with-outside-server-runtime`. Inspection of the actual deployed web container confirms nginx is present and Node/npm/node_modules are absent. Findings remain unresolved raw findings, with owner policy applied only to their verified runtime boundary.

DEV immutable images: API209 `sha256:a4432f7d8c1d2733fd24d6a142f5119dfd2918b570ad13ef8398f38a86092d3e`; web398 `sha256:59e0def7188abd50d7b99b7ff950124a7da68a551b354d6b5cf0600b2715f111`; collaboration59 `sha256:06fe50eb8733e7f007d82ff96c39802889067edd0b16accd4fd34a47a9d09d6b`.

## DEV migration preparation

Only DEV edge routes were applied using the scoped AX41 procedure and RF dev-ingress tag; shared production blocks were preserved. Both DEV origins respond successfully. The exact library/revision/material/live HTML routes use a 21 MiB multipart envelope, with application validation retaining the 20 MiB file limit.

Read-only versioned Job `api-gateway-game-library-dev-inventory-1016-a` completed at 15:39:59 UTC with 275 READY, zero BLOCKED. This is the complete bounded UUID inventory, not a page sample. Its aggregate log/status is retained as `dev-inventory.log`.

Before mutating cutover, GitOps disabled writers and activated maintenance on the exact API209 image. The full database backup `/var/backups/playsay/shared-html-games-20261016T154127Z` passed an isolated PostgreSQL restore (275 HTML assets) and SHA256 `3fbd5754d1b27f04b5e4238d4714ee4a420ea8fa2c0018066a8c3512136d3e28`. Private object backup `/var/backups/playsay/game-library-objects-20261016T154127Z` contains 1,295 objects / 530,258,530 bytes; actual upload/download restore to an own temporary bucket matches every hash, manifest SHA256 `c32a02a6a18440144b1eb03411ea7d43060f685fb79ac67fd53b5de1d52e51ad`. Original objects/backups remain; only own temporary restore database/bucket/scratch was removed.

Capacity inventory found all 275 HTML sources (239,064,495 bytes) and 70 cover rows (2,025,383 bytes) in the backup, with no missing source object. The private MinIO PVC is 10 GiB and current bucket data is about 530 MB; host available capacity after refreshed backups is 22,933,946,368 bytes. The bounded migration container has 768 MiB memory/500m CPU and a 1,800-second deadline.

Fresh drain snapshots at 15:42:04 and 15:42:39 UTC confirm: zero live lesson-access windows (including grace/extensions/unknown-end handling), zero game processing/adaptation/enrichment pending, zero collaboration connections/rooms/snapshot queue, zero LiveKit rooms/participants. Historical expired IN_PROGRESS records are preserved. Evidence: `dev-drain-1.log`, `dev-drain-2.log`, protected backup/capacity logs. Apply Job and final acceptance are recorded after completion; no production migration is claimed.


## DEV resume correction

The first mutating Job `dev-cutover-1016-a` did not complete: 36 valid JPEG covers have generic `application/octet-stream` object metadata, and the inherited server JVM percentage profile hit the 768 MiB Job cgroup limit (OOMKilled137). Successful source transactions/checkpoints remain; no destructive rollback is attempted and maintenance/writers remain paused. Native metadata inventory confirms 70 actual JPEG covers: 34 declared image/jpeg and 36 generic. No image content or private keys are exposed in the aggregate evidence.

The forward correction recognizes only PNG/JPEG raster signatures for generic legacy MIME, preserves exact original bytes, rejects unknown generic content, and makes dry-run validate covers too. The integration regression covers invalid-content blocking without alias leakage, correction/restart, two repeated passes, canonical image/jpeg and exact original/copy bytes. A separate migration JVM profile replaces server sizing; the bounded Job gets 1 GiB cgroup headroom. Native delivery and resume must pass before this is a completed cutover.
