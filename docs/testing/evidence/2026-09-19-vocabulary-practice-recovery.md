# Vocabulary practice recovery — local and dev evidence

Change: `restore-vocabulary-practice-reliability`. Owner authorized implementation, develop integration, dev deployment and authenticated dev browser acceptance on 2026-09-19. Production is outside this authorization.

## Baseline and isolation

Platform worktree `vocabulary-recovery-platform`, branch `codex/restore-vocabulary-practice-reliability`, starts at develop `2d140f6f`. Infra worktree `vocabulary-recovery-infra` starts at develop `25fb5af`. Original dirty platform/infra checkouts are preserved; their changes were not imported. Relevant overlaps include vocabulary repositories and shared locale files.

## Local reproduction and verification

- Before fixes, three added player regressions failed: parent state update erased corrective feedback, repeated form submit sent two requests, same-item hint reset typed input.
- Fixed player plus composer initially passed 10/10 selected tests; full web suite passed 785/785 before additional coverage.
- Backend characterization/plan/selection tests passed; full vocabulary suite passed after adding terminal replay, denied actor/new terminal attempt and all four frozen homework policy tests.
- Hook stale-context/recoverable-error and media pending-to-terminal coverage passed (12 selected tests).
- Web production build passed after building its game-sync workspace dependency. Public wire shapes are unchanged; generated clients require no edit.
- New tests use synthetic content; no credentials or learner payloads are retained here.

## Remaining acceptance

Final counts, source commit, Jenkins/security reports, immutable image identities, browser results and cleanup are appended after execution. This initial evidence does not claim delivery or end-to-end acceptance.

## Final local gate before dev integration

- Web: `npm --workspace web-app run lint`, full `test` (148 files / 790 tests), production `build`: PASS.
- Vocabulary: pipeline-equivalent `gradle :vocabulary-service:detektMain :vocabulary-service:test :vocabulary-service:bootJar`: PASS; 87 tests, zero failures/errors/skips. Concurrent terminal replay returns one attempt and one evidence record. All four custom completion policies preserve their frozen settings.
- Initial generic `detekt` invocation reported existing untyped-baseline complexity findings. The repository's Jenkins command uses `detektMain` and its checked-in typed baseline; that required gate passed without baseline changes.
- No OpenAPI shape or dependency versions changed. Existing gateway sourcePracticeId deduplication supports continuation retry; browser confirmation remains pending.
