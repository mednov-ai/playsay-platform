# Vocabulary practice recovery — DEV delivery and acceptance

OpenSpec: `restore-vocabulary-practice-reliability`. The owner authorized implementation, develop integration, DEV GitOps deployment and browser acceptance with DEV accounts. Production was not operated or promoted.

## Result

The player, frozen publication settings, last-answer retry, category selection, Key authentication, media refresh, and live discovery/control synchronization fixes are in develop and deployed to DEV. Authenticated acceptance used a teacher and two students through external Playwright, with real gateway/vocabulary/Key APIs. Technical health is recorded separately from product acceptance.

The owner resolved both follow-up decisions. Teacher RETURN now creates mistakes-only rework (whole frozen set when all answers were correct); recipe DELETE archives while preserving history. Both passed authenticated DEV acceptance after source `012d1319` was delivered. All 31 OpenSpec tasks are complete; the change is not archived. See the follow-up section for final build identities and evidence.

## Initial recovery source, builds and immutable images

Isolated platform work started at develop `2d140f6f`; infra at `25fb5af`. Original dirty checkouts were preserved. Platform commits `a4a31eb4`, `5a3c59e1`, `a93c03a9`, `36d95e9d`, `6da05075`, `f9cff14b`, `dba43986` are integrated into develop. Infra functional commit `004bbdf` is also in develop.

| Component | Successful build | Source | Runtime image digest |
| --- | --- | --- | --- |
| Web | 338 / dispatcher 213 | `dba43986b100080bafe536ce0c4c36d89ee0e001` | `sha256:ac89823995dd80db7de344031c6a32e992705da18ead669ec7a4964b22e1e0fd` |
| Vocabulary | 66 / dispatcher 210 | `36d95e9d94e603b0ae184ec3ed81e4a13d8eefc8` | `sha256:0a7ed3f9bf59964ad0b0064655aff48f515675b15fe80d185b0a2df440a664dd` |
| Key frontend | 99 / dispatcher 209 | `a93c03a9cd6d4a5c016f8d69be0e178d8a8e1684` | `sha256:219f7d051bb81b5b651de25398949abb9a75e0b1c5206d4efa5c77fe12ed4110` |

Web build 337 and dispatcher 212 were deliberately stopped before publication when the additional hint-ordering defect was found. Build 338 contains both follow-ups. Initial recovery image-pointer commit: infra `0489904`. Web, vocabulary and Key applications were Synced/Healthy, their pods had zero restarts, and all 13 DEV product deployments were ready.

Backend composer/adaptive-policy/delivery-policies/key-ngrams/generated-media flags were true. Web CI confirmed the corresponding VITE flags plus practice/homework/live/key and personal-practice-v2, with `https://dev.key.honey.school` as Key origin. The initial recovery changed no public wire shape, dependency version or schema. The approved follow-up below adds an internal endpoint and vocabulary migration.

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
| Recipes create/update/select and frozen self launch | PASS; later changes do not rematerialize an existing session; used-recipe archival passed in the follow-up below |
| Self/homework exercises | PASS: MATCHING, FLASHCARD, MEANING_CHOICE, FORM_INPUT, PHRASE_BUILDER; wrong/final feedback remains until Continue |
| Lost final response | PASS: real accepted response discarded in the browser, explicit Retry recovered the same result on the completed session without extra attempts |
| Homework policies | PASS: all four custom policy/threshold combinations preserved through publication; meaningful/complete finished; mastery remained IN_PROGRESS at 33.33% below 70%, then a separate 20% target completed at actual 66.67%; teacher review reached AWAITING_REVIEW and ACCEPT completed it |
| Teacher RETURN/rework | PASS in the follow-up below: mistakes-only and whole-set fallback, learner completion and teacher acceptance |
| Live teacher + two students | PASS on deployed web 338: no-material discovery, pause/resume, help/hint, preserved drafts, independent progress, stopped-versus-complete UI, desktop/mobile |
| Live failure and reconnect | PASS on deployed web 338: injected Pause/Hint 503 stays recoverable without raw errors or unhandled rejection; explicit retry succeeds; bounded transport interruption and new WebSocket restore subscription without losing the draft |
| Stop/continue at home | PASS against real API: remaining snapshot preserved and repeated continuation returns one assignment |
| Key three modes | PASS: WHOLE_WORDS/CHARACTER_NGRAMS/MIXED, custom settings, fresh auth, actual typing, acknowledgement, duplicate callback (same result ID), return to Honey School; real n-gram callback/replay leaves SPELLING state unchanged |
| Media | PASS real generation/candidate inspection/teacher approval/reuse/regeneration/owner delivery; candidate and foreign-owner delivery denied; approved asset survives regeneration and hide/default changes |
| Provider/storage failure | PASS locally with injected integration failures; no real infrastructure outage was induced |
| Privacy | PASS: foreign session and media access denied; authorized final replay succeeds; new paused/stopped attempt rejected |
| Locales/layout | PASS: actual profile locale set/restored for ru/en/de/fr at 1440 and 390 pixels; screenshots inspected; no horizontal overflow; mobile keyboard navigation verified |

The local-bundle/real-API precheck was followed by the same live scenario on deployed web 338; only the latter closes deployment acceptance. Initial localStorage-only locale screenshots and harness selector/expired-fixture failures were not treated as product acceptance.

## Initial cleanup and handoff

Cleanup was restricted to recorded task-owned IDs. Twelve synthetic words were archived, ten recorded unfinished practices ended in CANCELLED, and five created lessons were deleted. Eight assignment/audit histories remain because no public deletion endpoint exists. The initially retained recipe was subsequently archived successfully by the follow-up. No pre-existing learner records were selected for mutation or deletion. Credential files are temporary and are removed at handoff.

Cross-domain `spec.md` §5.7, `keyboard.md`, focused vocabulary contract, manual matrix and the infra runbook/evidence were synchronized. Root cross-domain files and OpenSpec artifacts are outside these two repository worktrees. No OpenAPI regeneration was needed for behavior-only changes; CI still ran the standard generation step.

## Approved follow-up: immutable rework and recipe archival

The owner selected mistakes-only rework with whole-frozen-set fallback when no mistakes exist, and recipe archival preserving history. Source `012d131923282a8bff847f4b193effa967327905` is integrated into develop. This section supersedes the earlier pending-design status.

The vocabulary service creates one child session per completed source session, copies frozen content and lexical references, and leaves previous attempts unchanged. Normal practice queries select the active generation; history retains prior generations. Mistakes include attributed Key errors. The gateway locks the recipient during review/progress, resets only that recipient's current counters, and ignores known superseded-session callbacks or callbacks after acceptance. An old RETURN retaining completed progress can be retried to create a rework snapshot. Repeated RETURN while returned does not create another snapshot.

Recipe DELETE now archives idempotently, rejects foreign ownership, hides archived definitions from future selection/read/update, and retains plan references and historical sessions. Existing recipe names remain reserved. The additive vocabulary migration runs through Jenkins; after child sessions exist, old code assuming one session per practice/owner is not a compatible rollback. Use a forward fix without deleting history.

Local verification: vocabulary typed Detekt, 91 tests and bootJar passed; gateway typed Detekt, 13 AssignmentController tests, bootJar and OpenAPI export passed. Migration upgrade/replay preserved existing entries. Recipe tests exercise deletion after publication and preserved plan references. Rework tests cover mistakes-only/full fallback, repeated generation, peer isolation and immutable source records. Gateway tests cover legacy RETURN recovery, duplicate RETURN, late old-session callbacks and acceptance protection. Standard Orval generation, web lint and build passed; public review wire shape is unchanged and the internal rework endpoint is documented/generated.

DEV dispatcher 215 and all application jobs succeeded: API 189, vocabulary 67, web 339 and Key 100, all source `012d131923282a8bff847f4b193effa967327905`. Vocabulary migration job `playsay-migrate-vocabulary-service-67-012d1319` completed at 06:29:57 UTC. API full CI tests and OpenAPI check passed. API archived 30 artifacts and vocabulary 19; their backend/build-logic security gates used the unchanged accepted-risk policy (`passed-with-accepted-risks`).

| Final DEV component | Immutable digest |
| --- | --- |
| API 189 | `sha256:af6001f6d7e5b41675eac81f12a1f83654b998e463664376a1f99d48b412774c` |
| Vocabulary 67 | `sha256:91c844800c1a9ad5d6056ae9c8aca164e3429091b6f0e775604f7f01a9424c36` |
| Web 339 | `sha256:c470b802b13538c2ab5d794f90915bc4ff911e2ae6b43758d1f20580167b28ac` |
| Key 100 | `sha256:62bc45f0f5a0ef81a53c92935a4346bad3554f46daa4c74a46f8f49894471c11` |

Infra image commits: `5189052`, `9e3c08c`, `4729ad5`, `45d50e1`. All four applications were Synced/Healthy, each pod had zero restarts, and all 13 DEV deployments were ready. Runtime vocabulary flags remained enabled and runtime Liquibase disabled.

Authenticated browser acceptance with a teacher and two students passed:

- Teacher returned both completed homework sessions through the UI. A had one incorrect frozen item and received exactly one new item; B had no errors and received all five frozen items. Repeated RETURN reused the same child; the other recipient's pointer did not change. Foreign learner access to the new session returned 403. Original session status and attempt counters remained unchanged.
- Both students completed their rework through the real player. Desktop and 390-pixel mobile screenshots were inspected; no horizontal overflow. Teacher accepted both through the UI, both reports reached COMPLETED/ACCEPT, and repeated acceptance succeeded. Late old-session callback protection is covered by the gateway integration test, not claimed as an injected live callback.
- Used recipe deletion returned 204, including repeats, while foreign deletion returned 404. The archived definition returned 404, disappeared from the fully loaded browser selector and preserved prior history IDs/statuses/counters. The original FK-failing recipe was also archived. Early harness failures (navigation after reload, wrong self-preview route and comparison that included newly launched sessions) were corrected and are not counted as product failures or passing evidence.

Final cleanup archived 16 task-owned words in total, cancelled 12 recorded unfinished self/live practices, archived all 4 recorded recipes and deleted 5 created lessons. Nine assignment/audit histories remain because no public delete endpoint exists; source and child sessions for the rework remain immutable. No referenced recipe remains blocked on deletion. Cleanup and acceptance touched only recorded task-owned IDs; screenshots and credential material were not committed. Temporary credential files are removed at handoff.
