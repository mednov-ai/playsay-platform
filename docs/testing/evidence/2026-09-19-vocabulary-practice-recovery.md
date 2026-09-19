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

## Findings during authenticated DEV acceptance

- Real self-practice completed MATCHING, FLASHCARD and MEANING_CHOICE, with wrong-answer feedback and explicit Continue before the final summary. The browser exposed an additional existing presentation defect: matching feedback rendered internal pair IDs. A focused follow-up maps the accepted answer through the retained attempted-item labels, including lost final-response retry. A regression test covers that exact boundary.
- A late failed live refresh could overwrite recovery from a newer successful refresh. Both success and failure now use the same request generation; regression passes.
- At 00:44:14 UTC, the DEV vocabulary container was OOMKilled (exit 137) at its 512 MiB limit and nginx returned 502 for key-set. This establishes the failed request boundary, not a proven memory leak. DEV node working set was 74%; GitOps raises only the DEV container limit to 768 MiB, retaining the 256 MiB heap. Repeat authenticated acceptance is required after rollout.
- Initial localStorage-only locale screenshots did not exercise the intended translated dictionary after profile hydration; they are discarded as acceptance evidence. The corrected run updates/restores the demo profile locale and asserts document language and the actual dictionary view.

- Fresh Key login reproduced a silent fallback to the default letter-pair set: App discarded the launch query after OIDC. The follow-up retains a same-origin return path in the validated login flow and completed-flow record; external paths and credential-bearing callback paths are rejected. Key lint/build and all 193 tests pass (including one real code-exchange helper test with a duplicate callback). Real post-rollout acceptance remains pending.
- API gateway AssignmentControllerTest: 13 tests pass, including versioned/idempotent review progress and recipient authorization. Live two-owner privacy/help/hint/pause/resume/stop and sourcePracticeId continuation deduplication pass against DEV.
- Actual media generation produced a candidate; the teacher inspected and approved only the task's synthetic sense. Learner candidate access was denied, approved delivery succeeded only for the owner, regeneration retained the approved asset, and hide/default restored it. Provider/storage outage behavior is verified locally through injected integration failures, not by disrupting DEV infrastructure.
- Teacher RETURN is an unresolved contract gap: gateway changes the recipient to IN_PROGRESS while the immutable vocabulary session remains COMPLETED. Immediate ACCEPT is correctly rejected (409), but no rework path exists. The owner was asked whether rework should contain mistakes only or the whole frozen set. This task is not marked complete pending that decision.

- Teacher UI custom COMPLETE_SESSION + 2 prompts/1 entry publication passed. Learner UI completed 14 attempts across MATCHING, FORM_INPUT and PHRASE_BUILDER, preserving wrong/final feedback. Separate authenticated API reports confirmed meaningful/complete completion, mastery remaining IN_PROGRESS at 33.33% despite 100% diagnostic accuracy, and teacher-review AWAITING_REVIEW.
