# Shared HTML-game library — local acceptance, 2026-10-16

Change: `add-shared-html-game-library`. Local implementation and verification are complete; delivery and migration of real data have not been performed. OpenSpec remains active for the separately authorized delivery tasks.

## Source and work locations

- Platform base: `af7e2e2128860ce7e790dab737b600a32a56ed8d`, isolated detached checkout `/Users/evgeniymednov/Documents/Projects/Play&Say/.codex-worktrees/shared-html-game-library-platform`.
- Infra base: `aaa70eb9615f77f251eeb98ced7bc62bcfb88a68`, isolated detached checkout `/Users/evgeniymednov/Documents/Projects/Play&Say/.codex-worktrees/shared-html-game-library-infra`.
- These are the available local refs, not proof of the current remote/deployed source. See [source map](../../implementation/html-game-library-source-map.md).
- Both original dirty repositories were preserved. The cross-domain workspace `spec.md` was updated separately. No commit, push, PR, merge, remote CI, deployment, production database or remote object-store operation was performed.
- Retained local evidence: [summary](</Users/evgeniymednov/Documents/Projects/Play&Say/local-results/shared-html-game-library-20261016/summary.json>), logs and eight screenshots in the same directory. The directory contains only synthetic local test evidence and is outside both implementation repositories.

## Result

All teachers share the uploaded HTML-game catalog. Immutable revisions, independent private HTML/covers/candidates, author/admin editing, forks and archive retention are implemented. Catalog searches/filters/pagination are server-side, and learner content access is bound to an exact readable material or accepted active lesson launch.

Library selection pins game/revision to new or existing editable materials. Editor uploads return that pair in asset metadata; replacing an already canonical block changes its pin and clears stale game-specific metadata. Updated editor enrichment is revision-owned. Legacy editor/live entry points still register independently owned games and support stable upload command retries. Material and lesson copies retain canonical references or lightweight aliases without copying shared HTML files.

A manager can explicitly start a library game in an admitted active SHARED lesson without a material. Launches have separate collaboration bindings and a monotonic primary presentation revision, with retained return kind and a WHITEBOARD extension value. Minimize keeps the iframe; confirmed stop ends only that launch; stale reads/stops cannot resurrect it. The direct runtime identity is pinned across authority reload, while iframe messaging keeps a separate random channel. Material Game Sync behavior remains on its existing lifecycle protocol.

The additive bounded migration supports dry-run, byte-exact copies, verified lineage/attribution, retained candidates and validation evidence, conditional material conversion, restart and full cutoff reconciliation. Missing objects, stale checksums, unresolved references and late sources prevent successful cutover. Historically accepted variants remain readable; obsolete/unverified mechanics evidence requires fresh review for new canonical attachment or direct launch. SQL/object checkpoints and original objects are retained. The GitOps Job requires immutable image identity, disabled writers, maintenance and verified drain for apply.

## Verified checks

| Check | Result |
| --- | --- |
| Selected api-gateway HTML-game, adaptation, collaboration and material-asset integration/regression suite | 73 cases: 72 passed, 0 failed/errors, 1 optional external-file fixture skipped |
| Liquibase and synthetic legacy migration | Passed in H2 PostgreSQL mode, including empty schema, private/archived/unreferenced sources and accepted/candidate adaptations |
| Storage/database failure matrix | Failed/uncertain PUT verification, checksum mismatch and DB command failure leave no visible partial game; retry reuses one command identity |
| Retention/permissions | Author/fork rules, creator removal, archive references and cover survival after original material object removal passed |
| Migration lineage and resumption | Exact copies group; broken/cyclic/different-byte/cross-author claims remain independent; partial batches/repeat runs do not duplicate revisions |
| Concurrent material conversion | Separate JDBC writer commits during conversion; stale compare-and-swap fails, preserves the concurrent edit, and resumed conversion retains it |
| Backup/recovery and disable | Synthetic H2 SQL backup restores mappings/documents, separately restored in-memory private objects resolve, and compatible readers work with writes disabled |
| Revision processing | Candidate stays outside playable revisions before trusted review; apply/rollback preserve source/accepted bytes; failed cover generation leaves fallback and playable game |
| Backend static analysis | Detekt main: 0 findings |
| OpenAPI and clients | Export from source and project Orval generation passed; new routes/error schemas/internal references validated; no manual generated-client edits |
| Frontend | Full suite: 159 files / 853 tests passed; lint and TypeScript/Vite build passed |
| Collaboration service | Build and full suite: 17 files / 78 tests passed |
| Game Sync SDK | Full suite: 2 files / 12 tests passed |
| Browser acceptance | 8 combinations passed: Chromium/WebKit × desktop/mobile × light/dark, with real components and local collaboration service |
| Localization | Identical nonempty game/library/picker/processing/lesson key sets in ru/en/de/fr |
| Infra | Helm lint/default/dry-run/apply renders, fail-closed migration guards, scoped upload route tests and diff whitespace checks passed |
| OpenSpec | Strict validation passed |

The optional skipped backend case is `supplied sub-limit games reach api content validation()`, which depends on an external supplied-file fixture. Synthetic 20-MiB and oversize validation is covered by the selected existing material-asset/optimization tests. Build output retains the existing large-chunk warnings; this work adds no package dependency.

The external Playwright fixture exercises local preview without broadcast, keyboard open/Escape/focus return, visible upload focus, filter retention, no-material two-client launch, synchronized actions, minimize, checkpoint recovery after both learner and authority reload, learner stop, immediate fresh launch, return with retained draft state, library-to-new-material flow and independent progress for two occurrences of one pinned revision. It uses a synthetic SDK game and synthetic HTTP/auth/lesson state with the real collaboration-service. Backend tests separately cover authorization, actual command persistence and migration. The fixture does not prove Keycloak browser admission, real historical game mechanics or physical media/audio.

## Reproduce locally

From the isolated platform checkout:

```sh
gradle -p backend :api-gateway:test --tests '*HtmlGame*' --tests '*MaterialGameAdaptation*' --tests '*Collaboration*' --tests '*MaterialAssetControllerTest' :api-gateway:detektMain
# Run export to completion before regenerating the client.
gradle -p backend :api-gateway:exportOpenApi
npm --prefix frontend --workspace web-app run generate
npm --prefix frontend --workspace web-app run lint
NODE_OPTIONS=--no-experimental-webstorage npm --prefix frontend --workspace web-app run test -- --maxWorkers=2
npm --prefix frontend --workspace web-app run build
npm --prefix frontend --workspace game-sync-sdk run test
npm --prefix collaboration-service run build
npm --prefix collaboration-service test
node scripts/ci/html-game-library-contract.test.mjs
node scripts/ci/html-game-upload-limits.test.mjs
node scripts/smoke/html-game-library-local-smoke.mjs
```

Node 26's experimental global web storage is disabled only for the jsdom test command. The smoke uses the external Playwright installation at `~/.codex/tools/playwright`, not a new project dependency. Build the game-sync SDK before the smoke if its dist is absent.

From the isolated infra checkout:

```sh
helm lint helm-charts/api-gateway
node scripts/test-html-game-upload-limits.mjs
node scripts/test-game-library-migration.mjs
```

## Outstanding delivery gates

OpenSpec tasks 9.1–9.3 remain pending because the coding request does not authorize delivery under the project AGENTS.md. Before any publication: reconcile with the then-current authorized source, retain newer platform/infra desired state, run fresh full security gates and native DEV, verify actual authenticated teacher/learner workflows and both origins, and obtain the required maintenance/delivery authority. Real PostgreSQL/object-store backup/restore, headroom, schema convergence, queue/lesson drain, frozen cutoff, full production reconciliation, deployed nginx validation, actual historical games and physical media/audio remain unverified. No expired or unrelated risk acceptance is extended by this implementation.

Use the infra runbook's shared-library migration procedure. Reader-compatible recovery retains canonical/legacy readers, schema, objects, aliases, checkpoints and progress; a pre-canonical reader or destructive downgrade is not a recovery plan. Develop integration of both repositories and OpenSpec archival require actual authorized delivery and acceptance evidence.
