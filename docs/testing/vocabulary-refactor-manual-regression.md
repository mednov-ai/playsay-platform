# Vocabulary and backend-refactor manual regression

## 1. Purpose and safety boundary

This catalog verifies the behavior preserved by the backend refactoring and the adaptive vocabulary module delivered across `vocabulary-service`, `api-gateway`, `keyboard-service`, web-app, and Honey School Key. It complements, but does not replace, unit/integration tests, OpenAPI generation, or the repository Playwright smokes.

Run only against the current Honey School dev contour unless an owner explicitly names another environment:

- web: `https://dev.online.honey.school`;
- Key: `https://dev.key.honey.school`;
- issuer: `https://dev.ops.honey.school/keycloak/realms/playsay`.

Never use production or the protected legacy hosts. Do not trigger real payment capture, send mail to real users, expose credentials, inspect object storage directly, or mutate a database. Use disposable demo records and supported UI/API cleanup. One full P1 run may request one paid first-use image generation; P0 should reuse an approved test asset or verify the text fallback.

## 2. Result and severity rules

| Value | Meaning |
|---|---|
| `P0` | Release gate. Any failure or block rejects the run. |
| `P1` | Full functional regression. A failure is release-blocking when it affects ownership, accepted activity, completion, immutable state, critical accessibility, or data integrity. |
| `P2` | Exploratory/resilience coverage. Record findings and impact explicitly. |
| `PASS` | All expected results and cleanup checks passed. |
| `FAIL` | At least one observable result differs from the contract; attach a defect/OpenSpec change. |
| `BLOCKED` | A declared prerequisite cannot be prepared safely. This is not a pass. |
| `NOT RUN` | The scenario was outside the selected profile. |

Unexpected 5xx, ownership leaks, lost accepted activity, duplicate completion, mutation of an immutable snapshot, inaccessible critical controls, hidden mobile clipping, or secret/private-data exposure are always release-blocking.

## 3. Execution profiles

### P0 release gate (about 60–90 minutes)

All of these canonical scenarios must pass: `OPS-EVID-001`, `RFX-AUTH-001`, `RFX-AUTH-002`, `RFX-CORE-001`, `RFX-CORE-002`, `VOC-ENTRY-001`, `VOC-MEM-001`, `VOC-COMP-001`, `VOC-PLAY-001`, `VOC-PLAY-002`, `VOC-LIVE-001`, `VOC-HW-001`, `VOC-KEY-001`, `VOC-MEDIA-002`, `VOC-UX-001`, `VOC-UX-002`, `VOC-UX-003`, and `OPS-EVID-002`.

### P1 full regression (about 4–6 hours plus generation latency)

Run P0 plus every `P1` case. One pass must cover all four locales and both representative viewports, but individual business scenarios may use `en` desktop unless their case says otherwise.

### P2 exploratory/resilience

Run `P2` cases when changing flags, provider/storage integration, unusual lexical content, or supporting refactored services. Coordinate dependency/flag manipulation separately; never improvise it in a shared dev environment.

## 4. Standard scenario record

Every execution report records the case ID/title, priority, measured duration, contract references, actor, locale/viewport, enabled flags, run prefix, precondition result, each action/expected-result pair, evidence reference, cleanup result, final status, and defect link. Screenshots must be redacted before attachment.

Steps prefixed **Setup/API** may use only the public authorized routes in `contracts/openapi.yaml`, `contracts/vocabulary-openapi.yaml`, and `contracts/keyboard-openapi.yaml`, or the repository smoke helpers. If a required state cannot be prepared through those boundaries, mark the case `BLOCKED`; do not edit PostgreSQL or MinIO.

## 5. Roles, credentials, and deterministic data

| Symbol | Dev identity | Relationship/purpose |
|---|---|---|
| `TEACHER_A` | `teacher-demo` | Manages `STUDENT_A`; creates lesson/homework and reviews media. |
| `STUDENT_A` | `student-demo` | Primary learner and owner of vocabulary evidence. |
| `STUDENT_B` | `student-demo-2` | Second learner for independent-state and foreign-resource checks. |
| `ADMIN_A` | `admin-demo` | Optional administrative/reviewer check only. |

Retrieve passwords only through the current runbook/Kubernetes secret workflow and keep them in process memory or private shell variables. Never print or paste them into this document, terminal transcripts, screenshots, or defects.

Use `manual-vocab-YYYYMMDD-<initials>-<short-random>` as the run prefix. Before starting, search the demo accounts for that prefix and stop on a collision.

| Fixture label | Suggested content | Required property |
|---|---|---|
| `IMG_NOUN` | `capybara` → `капибара` | Concrete imageable sense; designated reusable test asset. |
| `AMBIGUOUS_A/B` | `bank` as finance/river bank | Same spelling, distinct meanings/senses. |
| `PUNCTUATED` | `state-of-the-art` or `don't` | Key apostrophe/hyphen boundary. |
| `LONG_CONTENT` | `characteristically` with a long translation | Responsive wrapping/containment. |
| `ABSTRACT` | `justice` | Text-only/non-imageable or provider-fallback path. |
| `NO_CONTEXT` | `steady` without example | Unavailable `CONTEXT` must not block other skills. |
| `STATE_SET` | six disposable entries | Prepare visible new, recent, due, forgotten, difficult, and favorite categories with documented fixtures/API. |

Do not wait days to obtain scheduler states. Use the current authorized fixture/setup path; otherwise mark the time-dependent case blocked.

## 6. Refactoring regression

### RFX-AUTH-001 — Role sign-in and navigation

- **Priority/time:** P0 / 6 min. **Traceability:** `spec.md` §§3–4; `GET /api/me`, `GET /api/users/me/profile`.
- **Actors/environment:** `STUDENT_A`, `TEACHER_A`, optionally `ADMIN_A`; en desktop.
- **Preconditions:** No active auth session in each isolated browser context.
- **Actions and expected results:**
  1. Sign in as each actor through Keycloak. → The SPA returns to dev, `/api/me` and profile load without 5xx, and the visible workspace matches the realm role.
  2. Open the workspace switcher. → Student does not receive teacher/admin controls; teacher does not receive admin-only user management.
  3. Refresh, then sign out. → Identity survives refresh; sign-out clears the app session and returns through Keycloak without exposing another actor's state.
- **Evidence/cleanup:** Redacted role navigation screenshot and status-only request list; sign out every context.

### RFX-AUTH-002 — Managed versus unmanaged learner ownership

- **Priority/time:** P0 / 7 min. **Traceability:** `spec.md` §4.3 and §5.7; vocabulary privacy requirement.
- **Actors:** `TEACHER_A`, `STUDENT_A`, `STUDENT_B`.
- **Preconditions:** Confirm which demo learner is managed by `TEACHER_A`; if both are managed, use another documented unmanaged demo identity or mark the negative half blocked.
- **Actions and expected results:**
  1. As `TEACHER_A`, open managed learners and `STUDENT_A` vocabulary. → The learner appears and permitted vocabulary/dashboard requests succeed.
  2. **Setup/API:** Request the equivalent learner dashboard/preview with an unmanaged subject. → Backend returns 403/404 without learner vocabulary, counts, entry IDs, or media metadata.
  3. As each student, open Vocabulary. → Each sees only their own entries, recipes, sessions, and progress.
- **Evidence/cleanup:** Status and sanitized error code only; no learner payload in evidence. No data mutation.

### RFX-AUTH-003 — Foreign and tampered resource denial

- **Priority/time:** P1 / 8 min. **Traceability:** `spec.md` §7; vocabulary and Key authorization requirements.
- **Preconditions:** `STUDENT_A` owns a disposable entry/session/media asset; `STUDENT_B` is signed in separately.
- **Actions and expected results:**
  1. **Setup/API:** Reuse `STUDENT_A` opaque entry, session, and asset IDs in `STUDENT_B` authorized requests. → Each request returns 403/404; no content URL, answer, target stream, or owner identity leaks.
  2. Tamper one random opaque ID. → A sanitized 4xx is returned, never a stack trace or 5xx.
- **Evidence/cleanup:** Status/error code and endpoint pattern with IDs redacted; clean `STUDENT_A` records through supported routes.

### RFX-CORE-001 — Profile/gateway compatibility and validation

- **Priority/time:** P0 / 5 min. **Traceability:** backend refactor delivery; public OpenAPI profile contracts.
- **Actor:** `STUDENT_A`; ru then en desktop.
- **Actions and expected results:**
  1. Open Profile and change a reversible field such as locale. → Save returns normally, refresh shows the new value, and visible validation uses the selected locale.
  2. Submit an intentionally invalid value through the documented UI/API boundary. → A structured 4xx appears; no internal class/package/SQL detail and no 5xx.
  3. Restore the original value. → Profile and navigation remain usable.
- **Evidence/cleanup:** Redacted before/after UI, response status/shape; restore original profile value.

### RFX-CORE-002 — Schedule, material, and ordinary homework round trip

- **Priority/time:** P0 / 12 min. **Traceability:** `spec.md` §§5.2, 5.4, 5.6; public schedule/material/assignment contracts.
- **Actor:** `TEACHER_A` and `STUDENT_A`; en desktop.
- **Preconditions:** Unique run prefix; no real notification delivery.
- **Actions and expected results:**
  1. Create a disposable material with one text and one objective task; publish/save it. → It reopens with the same rendered content after refresh.
  2. Create a future lesson for `STUDENT_A`, attach the material, then reopen it. → Explicit material wins and participant/lesson data is preserved.
  3. Create ordinary homework from the material, open as student, save a draft, refresh, submit, then review as teacher. → Draft is learner-private, persists, submission/review states converge, and retry does not duplicate work.
- **Evidence/cleanup:** Redacted teacher/student screenshots; archive assignment/material and delete/cancel disposable lesson using supported actions.

### RFX-CORE-003 — Idempotent retry and sanitized failure shapes

- **Priority/time:** P1 / 8 min. **Traceability:** `spec.md` §§5.6 and 7; OpenAPI validation contracts.
- **Preconditions:** One disposable supported command that accepts a stable client/request ID.
- **Actions and expected results:**
  1. Submit the same valid request twice with the same idempotency identity. → One domain result/completion exists and both responses converge.
  2. Repeat with a stale resource revision or invalid UUID/payload. → Structured 4xx; the accepted state remains unchanged.
  3. Refresh the UI. → No duplicate card, progress, notification, or completion appears.
- **Evidence/cleanup:** IDs hashed/redacted; delete the single resulting test record.

### RFX-CORE-004 — Supporting refactored service boundaries

- **Priority/time:** P2 / 12 min. **Traceability:** backend refactor delivery manifest and public contracts.
- **Actors:** Authorized demo roles only.
- **Actions and expected results:**
  1. Exercise registration/user-management read or validation without creating a real learner. → Authorized responses/expected 4xx/403; no 5xx.
  2. Open email delivery-admin validation/read surface without sending mail. → No delivery side effect.
  3. Exercise payment validation/status without checkout/capture. → No invoice/payment side effect.
  4. Read media metadata and AI allowance/provider-selection status without external generation. → Optional service failure does not block profile/schedule/vocabulary.
- **Evidence/cleanup:** Status-only evidence; confirm no created user, mail, invoice, or AI session.

## 7. Vocabulary entry, memory, and composition

### VOC-ENTRY-001 — Add, edit, favorite, search, archive, and history

- **Priority/time:** P0 / 10 min. **Traceability:** `spec.md` §5.7; `/api/vocabulary/entries`.
- **Actor:** `STUDENT_A`; en desktop and 390 px mobile for the final view.
- **Preconditions:** Unique prefix entry with confirmed translation.
- **Actions and expected results:**
  1. Add the word from Vocabulary. → One active card appears with source, translation, new state, and non-blocking media placeholder/asset.
  2. Edit translation/example and toggle favorite. → Changes survive refresh; favorite filter finds it.
  3. Search by source and translation, then inspect History. → Matching active/history views are correct and no unrelated learner entry appears.
  4. Archive/delete through the supported UI. → It leaves active filters, remains represented according to History behavior, and recreation does not expose the old private context unexpectedly.
- **Evidence/cleanup:** Desktop/mobile redacted screenshots; archive the disposable entry and remove overrides/reports.

### VOC-ENTRY-002 — Occurrence deduplication and provenance

- **Priority/time:** P1 / 8 min. **Traceability:** adaptive vocabulary “preserves occurrences without duplicating entries”.
- **Preconditions:** One entry and two supported occurrences of the same normalized form/sense from distinct disposable sources.
- **Actions and expected results:**
  1. **Setup/API:** Add both occurrences for `STUDENT_A`. → One personal entry remains while occurrences/provenance show both sources/times.
  2. Repeat one occurrence request with the same idempotency identity. → No duplicate entry or duplicate accepted occurrence is created.
- **Evidence/cleanup:** Card/occurrence count and sanitized source types; archive the entry and disposable sources.

### VOC-ENTRY-003 — Same spelling, distinct senses, and teacher add

- **Priority/time:** P1 / 10 min. **Traceability:** adaptive privacy/entry requirements; sense-aware media requirement.
- **Actors:** `TEACHER_A`, `STUDENT_A`.
- **Actions and expected results:**
  1. Add `AMBIGUOUS_A` and `AMBIGUOUS_B` with distinct meanings. → Two personal entries/memory states are retained; they are not merged solely by spelling.
  2. As teacher, add a prefixed word for the managed learner. → It appears only in that learner's vocabulary with teacher provenance.
  3. Attempt the same for an unmanaged learner. → Backend denies without creating an entry.
- **Evidence/cleanup:** Redacted cards and denial status; archive all prefixed entries.

### VOC-MEM-001 — Adaptive category reasons

- **Priority/time:** P0 / 8 min. **Traceability:** adaptive memory, scheduling, difficulty, and recommendation requirements.
- **Preconditions:** `STATE_SET` prepared through documented fixtures/API.
- **Actions and expected results:**
  1. Open All, then Recent, Due, Forgotten, Difficult, New, and Favorites. → Each prepared entry appears only in applicable selections; visible stage/review reason matches prepared evidence.
  2. Open recommended preview. → It is bounded by the selected item/time budget and explains represented categories rather than only returning a count.
  3. Refresh. → Reasons and due state are stable; no optional AI/media failure hides the list.
- **Evidence/cleanup:** One redacted overview plus category/result table; cleanup `STATE_SET` after dependent cases.

### VOC-MEM-002 — Per-skill state and unavailable context

- **Priority/time:** P1 / 8 min. **Traceability:** per-skill memory and presentation-before-retrieval requirements.
- **Preconditions:** `NO_CONTEXT` entry with evidence in meaning/form/spelling but no usable context.
- **Actions and expected results:**
  1. Inspect the dashboard/plan. → `MEANING`, `FORM`, and `SPELLING` expose independent state/due reasons; unavailable `CONTEXT` is excluded rather than shown as failed.
  2. Complete eligible skills according to the plan. → Absence of an exact example does not prevent mastery of available skills.
- **Evidence/cleanup:** Sanitized skill/reason table; archive the entry after practice cleanup.

### VOC-MEM-003 — Recoverable difficulty and evidence idempotency

- **Priority/time:** P1 / 10 min. **Traceability:** recoverable difficulty, immutable evidence, idempotent writes.
- **Preconditions:** One difficult spelling entry and a session item with a known client attempt ID.
- **Actions and expected results:**
  1. Submit the same successful attempt twice. → One accepted attempt/evidence effect; projection/progress is not doubled.
  2. Add enough distinct successful evidence under the current policy. → The affected skill eventually leaves Difficult when the configured threshold is met; historical lapse remains in history without permanent difficult status.
  3. Reload during/after projection. → Accepted activity remains visible even if projection is delayed.
- **Evidence/cleanup:** Sanitized before/after reason and attempt count; archive test entry/session.

### VOC-COMP-001 — Recommended and custom practice

- **Priority/time:** P0 / 10 min. **Traceability:** dynamic selection and bounded recommendation requirements.
- **Actor:** `STUDENT_A`.
- **Actions and expected results:**
  1. Open the composer with Due + Difficult, pin one eligible entry, exclude another, set a bounded item count/time and new-word limit. → Preview includes the pin, omits the exclusion, respects limits, and shows a reason/warning per selected item.
  2. Switch to recommended practice. → Due/lapsed/difficult/new balance and estimated duration are shown; preview remains editable before launch.
  3. Launch. → A session opens with the previewed owner/content and no unrelated entry.
- **Evidence/cleanup:** Composer/preview screenshot with private examples hidden; finish or stop/archive the disposable session.

### VOC-COMP-002 — All selection sources and limits

- **Priority/time:** P1 / 12 min. **Traceability:** dynamic selection requirement.
- **Preconditions:** Eligible recent/due/forgotten/difficult/new/favorite, lesson, course, and manual entries.
- **Actions and expected results:**
  1. Preview each source separately, then supported combinations. → Only eligible entries appear and source/category counts agree with selected cards.
  2. Exercise item, duration, and new-word limits with pin/exclude. → Limits are deterministic; explicit pin/exclude has documented precedence and warnings explain unavailable entries.
- **Evidence/cleanup:** Source-to-entry matrix; no new persistent state unless a session is launched.

### VOC-COMP-003 — Dynamic recipe and immutable launched snapshot

- **Priority/time:** P1 / 12 min. **Traceability:** saved-selection and immutable-session requirements.
- **Actions and expected results:**
  1. Save a named Due + Difficult recipe and reopen it. → It resolves current eligible entries.
  2. Launch a session; record sanitized item order/count/revision. → Snapshot is created.
  3. Edit recipe, translation, favorite/due eligibility, then reopen recipe and active session. → Recipe preview reflects current state; active session retains original entries/content revision/order/policy/seed.
- **Evidence/cleanup:** Sanitized preview/session comparison; delete recipe and stop/finish the session, archive entries.

## 8. Practice, lesson delivery, and homework

### VOC-PLAY-001 — Presentation-first and text fallback

- **Priority/time:** P0 / 8 min. **Traceability:** presentation-to-retrieval and safe media degradation requirements.
- **Preconditions:** New entry without retrieval evidence and no approved image.
- **Actions and expected results:**
  1. Launch balanced self-practice. → Unfamiliar content is presented/recognized before unsupported production.
  2. Continue while image/context enrichment is absent or generating. → Compatible text-based exercise renders and the session remains actionable.
  3. Refresh. → The same snapshot/current position resumes.
- **Evidence/cleanup:** Prompt type/order and fallback screenshot; complete or stop session and archive entry.

### VOC-PLAY-002 — Skill-aware grading and corrective proof

- **Priority/time:** P0 / 10 min. **Traceability:** controlled variants and corrective retry requirements.
- **Preconditions:** Session with meaning and spelling items.
- **Actions and expected results:**
  1. Submit a configured acceptable meaning variant. → Accepted according to normalized meaning rules.
  2. Submit a spelling error. → It is not credited as correct spelling; the UI shows correction/proof before a retry/new prompt.
  3. Request a hint, retry correctly, and finish. → Hint/latency/attempt are reflected; progress completes once and diagnostic accuracy remains separate from mastery/completion.
- **Evidence/cleanup:** Redacted feedback/progress; finish and archive disposable content.

### VOC-PLAY-003 — Pause, reload, reconnect, and duplicate attempt

- **Priority/time:** P1 / 10 min. **Traceability:** idempotent/resumable session writes.
- **Actions and expected results:**
  1. Answer one item, pause, reload, and resume. → Accepted item/progress remains and current position is restored.
  2. Simulate a brief offline/reconnect around one submit or repeat the same attempt ID through Setup/API. → One accepted attempt and one visible progress increment.
  3. Complete and reopen history. → Completion is stable; active session is not duplicated.
- **Evidence/cleanup:** Sanitized progress before/after; archive session data through normal lifecycle.

### VOC-LIVE-001 — Teacher launch, controls, and private progress

- **Priority/time:** P0 / 12 min. **Traceability:** vocabulary delivery teacher preview/live/private progress requirements.
- **Actors:** `TEACHER_A`, `STUDENT_A`, `STUDENT_B` in isolated contexts.
- **Preconditions:** Disposable active lesson with both learners and eligible vocabulary.
- **Actions and expected results:**
  1. Teacher previews personalized vocabulary and starts live practice. → Each learner receives an immutable learner-specific session; exclusions/warnings are visible before launch.
  2. `STUDENT_A` answers while `STUDENT_B` remains idle. → Teacher sees actionable per-learner progress; students never see each other's answers/progress.
  3. Teacher pauses, sends help, resumes, then stops. → State converges after reload/reconnect and accepted activity remains.
- **Evidence/cleanup:** Redacted three-role screenshots; stop live activity and complete/delete disposable lesson according to supported flow.

### VOC-LIVE-002 — Lesson closure stop versus continue at home

- **Priority/time:** P1 / 10 min. **Traceability:** unfinished continuation and deterministic closure requirements.
- **Preconditions:** One completed and one unfinished learner session in a disposable lesson.
- **Actions and expected results:**
  1. Close with Stop. → Unfinished live work is stopped; completed work remains completed.
  2. Repeat with a second disposable lesson and Continue at home. → Unfinished work becomes resumable at home using the same snapshot exactly once.
  3. Repeat the closure request/action. → No duplicate homework/session/completion appears.
- **Evidence/cleanup:** Session states only; complete/archive disposable lessons and continuations.

### VOC-HW-001 — Explicit completion policies

- **Priority/time:** P0 / 15 min. **Traceability:** vocabulary delivery homework-policy requirement.
- **Actors:** `TEACHER_A`, `STUDENT_A`.
- **Actions and expected results:**
  1. For each policy `MEANINGFUL_ACTIVITY`, `COMPLETE_SESSION`, `MASTERY_TARGET`, and `TEACHER_REVIEW`, create a small prefixed assignment/preview. → Policy and learner-specific snapshot are frozen and visible before assignment.
  2. Perform only the minimum policy-relevant activity as student. → Completion changes only when that policy is satisfied; duration or diagnostic accuracy alone does not substitute.
  3. Open teacher report. → Completion evidence, difficult words, accuracy, mastery, and review state are separate; accuracy is not labelled as a grade by default.
- **Evidence/cleanup:** Policy/result matrix; archive every disposable assignment/session.

### VOC-HW-002 — Multi-learner independence and immutable homework

- **Priority/time:** P1 / 12 min. **Traceability:** learner-specific immutable snapshots and privacy.
- **Actors:** `TEACHER_A`, `STUDENT_A`, `STUDENT_B`.
- **Actions and expected results:**
  1. Assign one preview to both learners. → Each receives an independent snapshot/activity reference.
  2. Submit different progress/results. → Teacher report separates learners; one student cannot read or mutate the other's assignment/session.
  3. Edit source vocabulary/recipe after assignment. → Existing homework snapshots do not change.
- **Evidence/cleanup:** Redacted per-recipient summary; archive assignment and sessions.

### VOC-HW-003 — Retry, resubmission, and diagnostic reporting

- **Priority/time:** P1 / 10 min. **Traceability:** durable/idempotent delivery and actionable reporting requirements.
- **Actions and expected results:**
  1. Retry the same submission/completion callback. → One visible submission/completion.
  2. Resubmit improved answers when policy permits. → Report updates predictably and retains prior accepted evidence/history.
  3. Compare duration, accuracy, difficult count, mastery, and grade/review. → Metrics remain distinct; teacher can identify follow-up words without an automatic formal grade.
- **Evidence/cleanup:** Sanitized metrics, no answers; archive assignment.

## 9. Honey School Key

### VOC-KEY-001 — Whole-word launch, result, and return

- **Priority/time:** P0 / 10 min. **Traceability:** `keyboard.md` “Vocabulary practice context”; vocabulary Key mode/authorization requirements.
- **Preconditions:** Authenticated self-practice containing at least two supported words; Key origin is the allowlisted dev origin.
- **Actions and expected results:**
  1. Launch `WHOLE_WORDS` from Vocabulary. → Key shows vocabulary origin/mode/progress; targets remain whole atomic words.
  2. Complete one correct and one corrected target. → Progress/correction feedback is visible; pending delivery resolves or is clearly queued.
  3. Finish and use Return. → Authorized return reaches Honey School; completion is recorded once and may credit configured `SPELLING` evidence once.
- **Evidence/cleanup:** Key and returned vocabulary progress screenshots with targets redacted if private; finish/archive session.

### VOC-KEY-002 — Deterministic n-grams and mixed mode

- **Priority/time:** P1 / 15 min. **Traceability:** Key n-gram/mixed requirements.
- **Preconditions:** `PUNCTUATED` plus two normal words.
- **Actions and expected results:**
  1. Launch `CHARACTER_NGRAMS` with configured 2–5 (within allowed 2–8) lengths. → Targets are deterministic contiguous character spans with documented apostrophe/hyphen handling and source attribution.
  2. Reload/resume. → Same target IDs/order/offsets/materializer version/seed; acknowledgement never moves backward.
  3. Launch `MIXED`. → Whole words and n-grams are deterministically interleaved with bounded repetition/source coverage.
- **Evidence/cleanup:** Sanitized target type/length/order table; finish sessions.

### VOC-KEY-003 — Launch security and safe return

- **Priority/time:** P1 / 10 min. **Traceability:** Key launch/retrieval authorization requirement.
- **Actions and expected results:**
  1. Open expired, tampered, foreign-learner, or foreign-assignment launch contexts. → Key refuses safely without revealing targets, owner, assignment, or result state.
  2. Supply a non-allowlisted return target. → It is rejected or replaced by the safe product default; no open redirect.
  3. Reopen the valid owning launch. → It still works; invalid attempts did not mutate acknowledgement.
- **Evidence/cleanup:** Redacted denial/return origin; expire/archive disposable launch.

### VOC-KEY-004 — Offline retry and skill attribution

- **Priority/time:** P1 / 12 min. **Traceability:** Key result idempotency/skill-aware requirement.
- **Actions and expected results:**
  1. Go offline before a result callback, complete one target, then reconnect. → UI shows queued/pending delivery and retries the same client result ID.
  2. Repeat the callback. → One visible/backend completion; acknowledgement advances monotonically.
  3. Compare evidence after whole-word and n-gram success. → Whole word may credit spelling once; n-gram records pattern/activity only and never whole-word recall/mastery/homework accuracy.
- **Evidence/cleanup:** Sanitized delivery/evidence summary; complete session and restore network.

## 10. Generated vocabulary media

### VOC-MEDIA-001 — First-use asynchronous generation

- **Priority/time:** P1 / 5 min plus provider latency. **Traceability:** media first-use/concurrency requirements.
- **Preconditions:** New unique imageable sense with no approved asset; this is the one paid generation allowed for the run.
- **Actions and expected results:**
  1. Open the word/media view concurrently in two owning/eligible contexts. → Text/card/practice remains usable and at most one active first-use generation exists.
  2. Refresh while pending. → Placeholder/generating state is non-blocking and does not spawn uncontrolled duplicates.
  3. Wait boundedly for result. → Candidate or sanitized failure state appears; no raw prompt/private example is exposed.
- **Evidence/cleanup:** State/timestamps and redacted placeholder; retain only the designated candidate for review, archive duplicate entry/context.

### VOC-MEDIA-002 — Review, approval, authorized delivery, and accessibility

- **Priority/time:** P0 / 10 min. **Traceability:** review lifecycle, provenance, authorization, accessibility.
- **Actors:** `TEACHER_A` reviewer for managed `STUDENT_A`; optionally `ADMIN_A`.
- **Preconditions:** Safe designated candidate or existing approved `IMG_NOUN` test asset.
- **Actions and expected results:**
  1. Open reviewer queue. → Candidate shows intended sense, safe state, origin/model/template provenance, timestamps/dimensions where available, and review history without private learner context.
  2. Approve the candidate if still pending. → General eligible view changes to approved; content loads only through the opaque authorized application route.
  3. Inspect learner image and accessibility tree. → Image is contained, not distorted/cropped, and has meaningful localized/source alt text or is correctly decorative when redundant.
  4. Request content as a foreign learner. → 403/404 and no object key, credential, unrestricted URL, or bytes.
- **Evidence/cleanup:** Redacted review/learner screenshots and status; retain only the declared reusable `IMG_NOUN` asset, archive disposable entry.

### VOC-MEDIA-003 — Regeneration and rejection preserve approved asset

- **Priority/time:** P1 / 12 min plus provider latency. **Traceability:** regeneration-preserves-current requirement.
- **Preconditions:** Approved reusable asset and authorization to regenerate.
- **Actions and expected results:**
  1. Request Generate another. → A distinct candidate is created; current approved image remains displayed and historical session content remains readable.
  2. Reject the new candidate. → It is excluded from learner selection and the prior approved asset remains current.
  3. If a safe pre-created candidate is available, approve it. → New sessions use it while old immutable references remain readable.
- **Evidence/cleanup:** Asset IDs hashed, before/during/after state; reject/archive test-only candidate and declare retained approved asset.

### VOC-MEDIA-004 — Hide, wrong-image report, and personal override

- **Priority/time:** P1 / 10 min. **Traceability:** learner-specific override requirement.
- **Actors:** `STUDENT_A`, `STUDENT_B`, `TEACHER_A`.
- **Actions and expected results:**
  1. As `STUDENT_A`, report Wrong image, then Hide. → That entry uses text fallback/allowed alternative and records a non-leaking report.
  2. Open the same approved sense as `STUDENT_B`. → Shared approval remains unchanged for the other learner.
  3. If UI exposes an allowed alternative/teacher override, select it for `STUDENT_A`. → Only the scoped entry changes.
- **Evidence/cleanup:** Two-learner comparison with content redacted; reset override where supported and archive disposable report/entry.

### VOC-MEDIA-005 — Sense-safe and scope-safe reuse

- **Priority/time:** P1 / 10 min. **Traceability:** sense identity and reuse privacy requirements.
- **Actions and expected results:**
  1. Create the approved `IMG_NOUN` sense for another eligible learner. → Same approved asset may be reused without another generation.
  2. Create two `bank` meanings. → Media pools/assets are not reused solely because spelling matches.
  3. Create an unresolved private entry or request across a disallowed learner/tenant boundary. → It is not promoted/shared automatically and unauthorized metadata/content is denied.
- **Evidence/cleanup:** Hashed asset comparison and statuses; archive disposable entries, retain only declared reusable asset.

### VOC-MEDIA-006 — Provider/storage/safety and non-imageable fallback

- **Priority/time:** P2 / 10 min after separately coordinated failure setup. **Traceability:** unsafe/non-imageable safe degradation.
- **Preconditions:** Authorized reversible provider/storage fault or a known abstract/suppressed test sense; never alter shared flags ad hoc.
- **Actions and expected results:**
  1. Resolve media for the affected sense. → Sanitized failed/non-imageable/text-only state; list and practice remain usable.
  2. Refresh/retry within a bounded window. → No uncontrolled request storm; existing approved immutable references remain readable.
  3. Restore dependency/flag. → New eligible requests recover without changing previously accepted evidence.
- **Evidence/cleanup:** Sanitized state/count only; restore setup and archive disposable entries.

Subjective image-quality notes are optional P2 observations. Objective safety, intended lexical sense, rendering, alt text, authorization, and lifecycle determine PASS/FAIL.

## 11. UX, localization, accessibility, and flags

### VOC-UX-001 — Four locales

- **Priority/time:** P0 / 12 min. **Traceability:** `spec.md` §3 and delivery localization requirement.
- **Actors:** Student and teacher fixture/API-smoke contexts; 1440×900 and 390×844.
- **Actions and expected results:**
  1. Open vocabulary composer/player/media and teacher homework/report in ru, en, de, fr. → Visible and assistive controls/statuses use the locale; no raw `vocabulary.*`/`homework.*` key appears.
  2. Switch locale during an unfinished session and reopen. → UI locale changes while immutable learning content/order remains unchanged.
  3. Inspect brand and target text. → Honey School and user vocabulary are not mistranslated.
- **Evidence/cleanup:** One screenshot per locale/representative viewport; fixture contexts require no persistent cleanup.

### VOC-UX-002 — Keyboard, focus, announcements, and reduced motion

- **Priority/time:** P0 / 10 min. **Traceability:** delivery accessibility requirement and `keyboard.md` Key surface.
- **Actions and expected results:**
  1. Navigate student composer, filters, media actions, player, teacher policy/report, and Key using only Tab/Shift+Tab/Enter/Space/arrows. → Every critical control is reachable once in logical order with visible focus and an accessible name.
  2. Trigger validation, answer feedback, progress, pending delivery, and completion. → State is announced through appropriate accessible status/labels without focus loss.
  3. Enable reduced motion. → Nonessential animation is suppressed; no control or state disappears.
- **Evidence/cleanup:** Accessibility snapshot/focus screenshots without private content; finish disposable session.

### VOC-UX-003 — Desktop/mobile containment and critical actions

- **Priority/time:** P0 / 10 min. **Traceability:** delivery responsive requirement; project UX checkpoint.
- **Actions and expected results:**
  1. At 1440×900 and 390×844, inspect header, filters, composer, word card, media, player, homework/live controls, and report. → No document or hidden-container horizontal clipping; primary action remains reachable without overlap.
  2. Use `LONG_CONTENT` and approved square media. → Text wraps/truncates with a usable full-value path; image uses contained aspect ratio and card stays inside viewport.
  3. Inspect empty/loading/error states and mobile filter overflow. → Status is understandable, controls are not covered, and any horizontal filter strip is discoverable/operable.
- **Evidence/cleanup:** Full viewport screenshots and measured card/document bounds; archive `LONG_CONTENT` entry.

### VOC-UX-004 — Themes, contrast, and exploratory polish

- **Priority/time:** P1 / 10 min. **Traceability:** `spec.md` §3.
- **Actions and expected results:**
  1. Inspect supported system/light/dark modes on web Vocabulary and Key. → Text, focus, selected filters, errors, placeholders, and media controls remain readable; brand asset has appropriate contrast.
  2. Check loading and disabled states. → Disabled status is distinguishable from low contrast or missing controls.
- **Evidence/cleanup:** Screenshots with theme/viewport; restore system theme.

### VOC-FLAG-001 — Independent feature-control rollback

- **Priority/time:** P2 / 20 min after separately authorized flag change. **Traceability:** `spec.md` §7 feature-control contract.
- **Preconditions:** Existing accepted evidence and active/historical immutable sessions; one flag changed at a time through GitOps.
- **Actions and expected results:**
  1. Disable adaptive policy/composer, delivery policies, Key n-grams, and generated media independently. → Corresponding new launch/generation controls are hidden/blocked without disabling unrelated vocabulary features.
  2. Reopen accepted evidence and in-flight/historical snapshots. → They remain readable/resumable according to contract; rollback does not delete data.
  3. Restore flags. → New behavior returns without duplicating in-flight work.
- **Evidence/cleanup:** Flag name and sanitized before/after state; restore GitOps configuration and verify health separately.

## 12. Operations, evidence, and cleanup

### OPS-EVID-001 — Preflight and deployed revision

- **Priority/time:** P0 / 5 min. **Traceability:** active runbook; project quality gate.
- **Actions and expected results:**
  1. Confirm web, Key, and issuer endpoints respond. → Expected success/login/discovery behavior.
  2. Read current ArgoCD/workload status through the runbook. → Relevant dev apps are Synced/Healthy and pods ready with no restart/error burst attributable to the test start.
  3. Record source/build/infra identifiers without credentials. → Execution can be tied to one deployed revision.
- **Evidence/cleanup:** Sanitized identifiers/status; no mutation.

### OPS-EVID-002 — Cleanup, bounded diagnostics, and closeout

- **Priority/time:** P0 / 10 min. **Traceability:** `spec.md` §7; all mutating cases.
- **Actions and expected results:**
  1. Search each actor for the run prefix and enumerate created lessons, materials, assignments, entries, recipes, sessions, candidates, reports, and overrides. → Inventory matches the execution report.
  2. Archive/delete/stop/reject/reset through supported actions; keep only a declared reusable approved asset. → No active disposable record remains and other demo data is unchanged.
  3. Review bounded sanitized application errors/restarts/status counts. → No unexplained 5xx, serialization/query/outbox/provider error burst, secret, prompt, answer, or private example appears.
  4. Complete the report. → Every selected case has PASS/FAIL/BLOCKED/NOT RUN, evidence, cleanup status, and defect link when failed.
- **Evidence/cleanup:** Redacted cleanup-zero result and sanitized health summary. Any cleanup failure fails the run.

## 13. Evidence policy

Allowed: scenario ID/time, tester initials, locale/viewport, redacted screenshots, HTTP status and sanitized top-level response shape, hashed/short opaque IDs, source/build/infra identifiers, ArgoCD sync/health, pod readiness/restart count, and sanitized error class/count.

Forbidden: passwords, tokens, cookies, authorization headers, kubeconfigs, database/object-store credentials, unrestricted asset URLs/object keys, raw AI prompts, learner names beyond demo aliases, private examples/answers, full request/response payloads, or copied logs containing them.

## 14. Execution report template

```markdown
# Vocabulary/refactor manual run — <date> <run-prefix>

- Environment / web / Key:
- Platform source / web build / vocabulary build / infra revision:
- Tester / profile: P0 | P1 | P2
- Browsers, locales, viewports:
- Feature controls / external generation used:
- Start/end time:

| Scenario | Status | Duration | Evidence | Defect/blocker | Cleanup |
|---|---|---:|---|---|---|
| OPS-EVID-001 | | | | | n/a |

Totals: PASS __ / FAIL __ / BLOCKED __ / NOT RUN __

Retained test asset: none | <hashed asset/sense and reason>
Cleanup confirmation: PASS | FAIL
Bounded diagnostic summary:
Release decision: PASS | FAIL
```

## 15. Traceability matrix

| Contract area | Canonical scenarios | P0 |
|---|---|---|
| Roles, backend authorization, learner privacy | RFX-AUTH-001..003, VOC-HW-002, VOC-KEY-003, VOC-MEDIA-002/005 | yes |
| Refactored gateway/profile/core boundaries | RFX-CORE-001..004 | yes |
| Entry occurrence/sense ownership | VOC-ENTRY-001..003 | yes |
| Immutable evidence, per-skill memory, versioned scheduling, recoverable difficulty | VOC-MEM-001..003 | yes |
| Dynamic selections, recommendations, recipes, immutable snapshots | VOC-COMP-001..003 | yes |
| Presentation, grading, corrective retry, resume/idempotency | VOC-PLAY-001..003 | yes |
| Self/live controls, private progress, closure/continuation | VOC-LIVE-001/002 | yes |
| Homework policies, learner snapshots, durable delivery, actionable report | VOC-HW-001..003 | yes |
| Whole words, deterministic n-grams/mixed, attribution, authorization, retry | VOC-KEY-001..004 | yes |
| Sense media, first use, review, regeneration, overrides, reuse, provenance, degradation | VOC-MEDIA-001..006 | yes |
| ru/en/de/fr, accessibility, responsive layout, themes | VOC-UX-001..004 | yes |
| Independent feature controls and rollback readability | VOC-FLAG-001 | no (P2) |
| Environment identity, evidence hygiene, cleanup | OPS-EVID-001/002 | yes |

Repository helpers for repeatable evidence: `scripts/smoke/vocabulary-student-ui-smoke.mjs`, `scripts/smoke/vocabulary-teacher-ui-smoke.mjs`, `scripts/smoke/sprint5-ui-smoke.mjs`, and `scripts/smoke/sprint6-homework-smoke.mjs`. Generated clients and contracts are never edited manually.

## Vocabulary hotfix recovery supplement

For entry/list recovery changes, also execute the defect scenarios and synthetic fixture plan in [2026-09-05 local hotfix evidence](evidence/2026-09-05-dev-vocabulary-hotfix-local.md). A passing mock UI smoke is not a deployed dev pass. Retest initial-load and history failures separately, last-visible-word archive/undo, mutation retry, partial group save, manual translation during provider latency, and existing VA-001–004 acceptance on the exact delivered revisions.
