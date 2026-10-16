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
