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
