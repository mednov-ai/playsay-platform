# Dev vocabulary hotfix — local verification, 2026-09-05

## Scope and source

OpenSpec: `restore-dev-vocabulary-end-to-end`, classified as a hotfix at the owner's request. Branch: `codex/hotfix-dev-vocabulary`; clean worktree created from fetched `origin/develop` at `639038349c11`. The existing platform production-hotfix checkout and dirty infra checkout are preserved. This report does not certify deployed dev behavior or authorize delivery.

## Confirmed defects and fixes

| Defect | Reproduction / regression | Result |
|---|---|---|
| Add succeeds but the dashboard remains stale | Real QuickAdd/dialog in component tests for student and teacher, active search preserved | Owner dashboard/search/preview invalidation after confirmed save |
| Initial dashboard errors look empty; pending history hides words | Independent API failure/pending mocks and browser 503/retry | Separate localized load/empty/denied/error states; stale entries hidden on access denial |
| Last visible entry archive hides undo | Component and browser archive → empty → failed undo → retry | Undo remains mounted through empty results and retries successfully |
| Favorite/pause/archive/undo failures are unhandled | Failure/retry and duplicate-click component tests | Explicit safe error and pending guards; no false success |
| Group save loses partial successes | One successful and one failed recipient, then retry | Success callback fires for confirmed recipients; unchanged retry sends only failed requests |
| Translator can overwrite manual input or block saving | Deferred provider response during manual edit and save | Manual save works during generation; late response is ignored |
| Edit error can display raw backend messages | Failed edit, preserved input, successful retry | Localized safe failure and guarded save |

The first six new panel cases failed against unmodified develop; the fixed suite passes. No backend/public API/schema changes were necessary.

## Verification

- Web lint, typechecked production build, and the full web suite passed: 657 tests in 129 files.
- Focused vocabulary and i18n checks: 56 tests passed, including 15 new recovery/cache tests and all locale integrity checks.
- Backend: `gradle -p backend :vocabulary-service:test :keyboard-service:test` passed (84 + 35 tests; no skips/failures). This includes duplicate occurrences, preview/recipe immutability, self/live/homework status and idempotency, completion policy, Key evidence/outbox, five-word overview, scope checks and media fallback/reuse.
- Student Playwright smoke: 16 scenario groups, ru/en/de/fr × 1440×900 and 390×844, including initial failure/retry and last-word undo failure/retry. Teacher smoke: 8 groups for preview/policy/review/accessibility.
- Key Playwright smoke: 5 groups (three typed modes, foreign/unavailable error/return, ordinary restored startup); Key vocabulary unit tests: 7 passed.
- Browser API responses are synthetic mocks. Backend integration tests use local test persistence/providers. These are not real dev teacher/student acceptance or real-provider checks.
- Reviewed representative mobile undo-error and desktop load-error screenshots. Error/retry/undo controls remain readable and reachable without horizontal overflow. Local screenshots/logs remain outside the repository. Final diff whitespace validation and strict OpenSpec validation passed. Both original repository working trees retain their pre-existing edits; infra tracking advanced through unrelated work.

## Read-only dev observations

At observation time, vocabulary, gateway, web and Key deployments each reported one ready replica. Vocabulary: `vocabulary-dev-50`, source `b15c57a619dd`; gateway: `api-dev-155`, source `639038349c11`; web: `web-dev-293`, source `639038349c11`. Key changed during this task to `key-frontend-codex-route-rf-users-via-selectel-geoip-93`, source `5e09756004fa`, through unrelated work; no operation here caused that rollout.

Vocabulary composer/adaptive/delivery/ngram/generated-media/backfill flags are enabled; startup Liquibase is disabled as required by the migration-job workflow. The current dev migration ledger and authenticated endpoint behavior were not certified. Fresh read-only revisions/flags/schema and GitOps health checks remain required before a permitted delivery.

## Dev fixture and acceptance plan

Use the existing manual regression plan `docs/testing/vocabulary-refactor-manual-regression.md` and its role/credential workflow. Use teacher-demo, student-demo and student-demo-2; verify relationships before positive tests. Use a separately confirmed unmanaged teacher/learner for negative scope cases; if none exists, record that half blocked rather than changing account relationships.

Choose a fresh `manual-vocab-YYYYMMDD-hotfix-<random>` prefix and check for collisions. Maintain an in-memory/private manifest of created entry, lesson, practice, recipe and assignment IDs. Use synthetic `steady`, a hyphenated word, no-translation/no-context cases, two homographs, and approved reusable image test content. Do not modify existing learner entries or wait/manually rewrite scheduler state to force due categories. Schedule/provider outage manipulation needs its own permitted environment boundary; local fault tests already cover these states.

After a separately authorized dev-only delivery, repeat CRUD/search/manual-provider fallback/partial group retry, lesson recent and socket reconnect, self preview/publication/result/history, live pause/help/stop/home continuation, homework frozen policy/progress, Key launch/results, and VA-001–004 media/privacy/layout scenarios. Record statuses and revisions without words, answers, credentials or raw object keys. Cancel only this run's practices, archive only this run's entries, remove only its recipes/assignments/lessons using supported APIs, and reject its unapproved media candidates according to the existing manual plan. There were no remote fixture mutations in this task, so no remote cleanup was needed.

## Remaining acceptance

Commit, push, CI and dev deployment were not requested by the apply instruction and were not performed. Real dev acceptance (especially authenticated reconnect/live coordination, gateway homework progress and provider/storage behavior), current schema convergence and post-delivery GitOps health remain open. Production and legacy were neither accessed nor changed.
