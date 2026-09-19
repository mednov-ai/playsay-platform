# Vocabulary practice recovery — DEV delivery and acceptance

OpenSpec: `restore-vocabulary-practice-reliability`. The owner authorized implementation, develop integration, DEV GitOps deployment and browser acceptance with DEV accounts. Production was not operated or promoted.

## Result and remaining scope

The player, frozen publication settings, last-answer retry, category selection, Key authentication, media refresh, and live discovery/control synchronization fixes are in develop and deployed to DEV. Authenticated acceptance used a teacher and two students through external Playwright, with real gateway/vocabulary/Key APIs. Technical health is recorded separately from product acceptance.

Two contract decisions remain open:

- **Teacher RETURN/rework:** the gateway returns the assignment to IN_PROGRESS while its immutable vocabulary session remains COMPLETED. No learner rework path exists. ACCEPT after the completion callback settles works. Rework must be defined as mistakes-only (with an all-correct fallback) or the whole frozen set before a new snapshot lifecycle is implemented.
- **Delete an already-used recipe:** DELETE returns 500 because `fk_vocabulary_plan_recipe` retains the immutable plan reference. DEV service logs confirmed the constraint at 02:11:01 UTC. The owner was asked to choose archival preserving history, or an explicit user-facing prohibition. No database bypass or historical-plan mutation was performed.

The change remains open; these defects and full acceptance/cleanup closure are not marked complete.

## Source, builds and immutable images

Isolated platform work started at develop `2d140f6f`; infra at `25fb5af`. Original dirty checkouts were preserved. Platform commits `a4a31eb4`, `5a3c59e1`, `a93c03a9`, `36d95e9d`, `6da05075`, `f9cff14b`, `dba43986` are integrated into develop. Infra functional commit `004bbdf` is also in develop.

| Component | Successful build | Source | Runtime image digest |
| --- | --- | --- | --- |
| Web | 338 / dispatcher 213 | `dba43986b100080bafe536ce0c4c36d89ee0e001` | `sha256:ac89823995dd80db7de344031c6a32e992705da18ead669ec7a4964b22e1e0fd` |
| Vocabulary | 66 / dispatcher 210 | `36d95e9d94e603b0ae184ec3ed81e4a13d8eefc8` | `sha256:0a7ed3f9bf59964ad0b0064655aff48f515675b15fe80d185b0a2df440a664dd` |
| Key frontend | 99 / dispatcher 209 | `a93c03a9cd6d4a5c016f8d69be0e178d8a8e1684` | `sha256:219f7d051bb81b5b651de25398949abb9a75e0b1c5206d4efa5c77fe12ed4110` |

Web build 337 and dispatcher 212 were deliberately stopped before publication when the additional hint-ordering defect was found. Build 338 contains both follow-ups. Final image-pointer commit: infra `0489904`. Web, vocabulary and Key applications were Synced/Healthy, their pods had zero restarts, and all 13 DEV product deployments were ready.

Backend composer/adaptive-policy/delivery-policies/key-ngrams/generated-media flags were true. Web CI confirmed the corresponding VITE flags plus practice/homework/live/key and personal-practice-v2, with `https://dev.key.honey.school` as Key origin. No public wire shape, generated client contract, dependency version or schema changed.

## Reproduced defects and verified fixes

- Parent session updates erased wrong/final feedback; duplicate form events sent two requests; same-item hints cleared input. Regressions first failed, then passed. Feedback now persists through explicit Continue, and retry retains its original attempt identity and payload.
- An accepted final attempt could not be replayed after completion. Owner/association checks remain before deduplication; accepted replay now precedes terminal checks. New terminal attempts and foreign actors are still rejected.
- Matching feedback exposed internal pair IDs. The retained attempted item now maps the accepted answer to readable word/translation pairs, including lost-final-response recovery.
- Preview/publish settings could disagree; recipient refetch could undo exclusions. The complete frozen policy/threshold settings identify the preview, and explicit recipient choices survive equivalent refetches.
- DUE list and preview differed (0 versus 6). Dashboard and planner now share the earliest due date among available skills, including SPELLING. FORGOTTEN includes LAPSED or lastRating=AGAIN in indexed and in-memory paths.
- A fresh Key sign-in discarded the vocabulary launch query and silently opened the bundled set. The validated login flow now preserves the safe same-origin relative return path. External and credential-bearing callback paths are rejected.
- A learner without an assigned lesson material never mounted the live workspace. The lesson shell now owns the subscription and opens the workspace when a practice appears.
- The teacher rail had an uncaught hint rejection and leaked transport text. Errors now remain localized and recoverable; a command captured in an earlier lesson cannot update the new context.
- A teacher hint was persisted at learner revision 4 but invisible in the browser: a local session timestamp had advanced practice metadata, causing the whole server snapshot to be discarded. Practice metadata and learner revisions are now merged independently; local session replacement does not manufacture a practice timestamp.
- At 00:44:14 UTC the old DEV vocabulary pod was OOMKilled/137 at 512 MiB while key-set returned 502. DEV-only limit is now 768 MiB, heap remains 256 MiB and request 384 MiB. This is measured native-memory headroom remediation, not a claim of proving or curing a memory leak.

## Verification

| Gate | Result |
| --- | --- |
| Web `lint`, full `test`, `build` | PASS: 148 files / 797 tests |
| Key `lint`, full `test`, `build` | PASS: 35 files / 193 tests |
| `gradle :vocabulary-service:detektMain :vocabulary-service:test :vocabulary-service:bootJar` | PASS: 89 tests |
| Gateway `AssignmentControllerTest` | PASS: 13 tests |
| DEV Helm lint, scoped diff checks, strict OpenSpec validation | PASS |

The initial untyped generic Detekt command reported existing baseline findings; the Jenkins-equivalent typed `detektMain` gate passed without changing baselines. Vocabulary 66 retained 19 security artifacts; backend and build-logic gates were `passed-with-accepted-risks` under policy SHA256 `05a67abe7f8dbe24fc2a47985919fe8333b7209aba4a9590e3fa65368cf95a96`. The existing exact Kotlin CVE-2026-53914 exception expires 2026-10-08; it was neither extended nor broadened.

## Authenticated acceptance matrix

| Scenario | Result and evidence boundary |
| --- | --- |
| Dictionary add/edit/search/favorite/pause/archive/last-visible-word undo | PASS through real UI/API; keyboard search clear restores focus on mobile |
| Group partial save | PASS: one real insert, one injected 503, retry only the failed owner; exactly two entries |
| Seven selection sources | PASS on the same six owned entries: RECENT=6, DUE=4, FORGOTTEN=1, DIFFICULT=0, NEW=0, FAVORITE=1, FULL_DICTIONARY=6; paused pinned word excluded |
| Recipes create/update/select and frozen self launch | PASS; later changes do not rematerialize an existing session; delete-used-recipe is separately BLOCKED above |
| Self/homework exercises | PASS: MATCHING, FLASHCARD, MEANING_CHOICE, FORM_INPUT, PHRASE_BUILDER; wrong/final feedback remains until Continue |
| Lost final response | PASS: real accepted response discarded in the browser, explicit Retry recovered the same result on the completed session without extra attempts |
| Homework policies | PASS: all four custom policy/threshold combinations preserved through publication; meaningful/complete finished; mastery remained IN_PROGRESS at 33.33% below 70%, then a separate 20% target completed at actual 66.67%; teacher review reached AWAITING_REVIEW and ACCEPT completed it |
| Teacher RETURN/rework | BLOCKED: no agreed rework-snapshot lifecycle; not counted as accepted |
| Live teacher + two students | PASS on deployed web 338: no-material discovery, pause/resume, help/hint, preserved drafts, independent progress, stopped-versus-complete UI, desktop/mobile |
| Live failure and reconnect | PASS on deployed web 338: injected Pause/Hint 503 stays recoverable without raw errors or unhandled rejection; explicit retry succeeds; bounded transport interruption and new WebSocket restore subscription without losing the draft |
| Stop/continue at home | PASS against real API: remaining snapshot preserved and repeated continuation returns one assignment |
| Key three modes | PASS: WHOLE_WORDS/CHARACTER_NGRAMS/MIXED, custom settings, fresh auth, actual typing, acknowledgement, duplicate callback (same result ID), return to Honey School; real n-gram callback/replay leaves SPELLING state unchanged |
| Media | PASS real generation/candidate inspection/teacher approval/reuse/regeneration/owner delivery; candidate and foreign-owner delivery denied; approved asset survives regeneration and hide/default changes |
| Provider/storage failure | PASS locally with injected integration failures; no real infrastructure outage was induced |
| Privacy | PASS: foreign session and media access denied; authorized final replay succeeds; new paused/stopped attempt rejected |
| Locales/layout | PASS: actual profile locale set/restored for ru/en/de/fr at 1440 and 390 pixels; screenshots inspected; no horizontal overflow; mobile keyboard navigation verified |

The local-bundle/real-API precheck was followed by the same live scenario on deployed web 338; only the latter closes deployment acceptance. Initial localStorage-only locale screenshots and harness selector/expired-fixture failures were not treated as product acceptance.

## Cleanup and handoff

Cleanup was restricted to recorded task-owned IDs. Twelve synthetic words were archived, ten recorded unfinished practices ended in CANCELLED, and five created lessons were deleted. Eight assignment/audit histories remain because no public deletion endpoint exists. One used recipe remains due to the confirmed FK deletion defect. No pre-existing learner records were selected for mutation or deletion. Credential files are temporary and are removed at handoff.

Cross-domain `spec.md` §5.7, `keyboard.md`, focused vocabulary contract, manual matrix and the infra runbook/evidence were synchronized. Root cross-domain files and OpenSpec artifacts are outside these two repository worktrees. No OpenAPI regeneration was needed for behavior-only changes; CI still ran the standard generation step.
