# Sprint 6 Homework And Group Progress Indicator Implementation Plan

> **For agentic workers:** REQUIRED PROJECT SKILL: use `play-and-say-project`. Keep `/Users/evgeniymednov/Documents/Projects/Play&Say/spec.md` synchronized with implementation. If visible frontend labels change, use `play-and-say-frontend-i18n` and update `ru/en/de/fr`.

**Goal:** make assigned material work durable outside the live lesson, so a student can continue unfinished lesson work as homework and also receive standalone assigned tasks. Add a teacher-facing group progress indicator only when there is more than one student to compare. Do not add health/status enums, grammar-check service, LanguageTool, Redis, LLM bridge, or new analysis runtime in Sprint 6.

**Architecture:** `api-gateway` remains the owner of assignments, submissions, permissions, scoring, and lesson websocket events. `collaboration-service` remains only the Yjs live document service from Sprint 5. Group progress is a presentation layer over existing `Submission.score`, `Submission.errorsCount`, `submittedAt`, `updatedAt`, and `submission.content.assessment`, all produced by the existing `MaterialScoringService`.

**Non-goals:**
- No `analysis-service`.
- No Redis Pub/Sub for Sprint 6 group progress.
- No LanguageTool.
- No OpenAI/Claude or LLM bridge.
- No student-facing AI feedback.
- No new homework microservice.
- No persisted health status or recipient status state machine.

---

## Product Scope

Sprint 6 has two product slices.

1. **Homework / assigned work**
   - A lesson material becomes a durable assignment, not just a live-session artifact.
   - If the lesson ends before teacher/student finish the material, the student still sees the work in "Assignments/Homework" and can continue.
   - Teacher can explicitly assign a material as homework from a lesson, from the material library, or as a standalone task.
   - Student can open assigned work without LiveKit/video.
   - Existing saved answers, live collaboration snapshots, score, errors and submitted state are preserved.

2. **Group progress indicator from automatic scoring**
   - The indicator appears only when an assignment/lesson has more than one student recipient.
   - For a single-student assignment, show the normal score/errors/submission information only; do not render a separate health indicator.
   - The indicator is a green-to-red current-progress scale, not a status badge.
   - Before the student has a draft/submission with real answers, do not display an initial `10/10` or green state.
   - Once answers exist, display the current score/errors state: fewer current errors is greener, more current errors is redder.
   - The indicator is computed from existing scoring output, not from grammar analysis:
     - `score` vs assignment `maxScore`;
     - `errorsCount`;
     - `submittedAt`;
     - `updatedAt`;
     - `content.assessment.items[*].status`, retries and hints.
   - Do not introduce separate status labels such as "needs attention" or "ok"; the score/errors already express how well the work is going.
   - The indicator is used only for teacher comparison in group lesson supervision and group homework review.

---

## Current Baseline

Already available from Sprint 4/5:
- `AssignmentEntity` exists and can point to `lessonId`, `materialId`, `materialBlockId`, `type`, `payload`, `maxScore`.
- `SubmissionEntity` exists and stores `assignmentId`, `studentUserId`, optional `lessonId`, `yjsDocumentId`, `content`, `score`, `errorsCount`, `submittedAt`.
- `LessonMaterialStore.saveSubmissionForScheduledLesson` and `saveCollaborationSubmission` already run `MaterialScoringService`.
- Teacher can list scheduled lesson submissions via `GET /schedule/lessons/{lessonId}/material-submissions`.
- Student can save scheduled lesson material answers via `PUT /schedule/lessons/{lessonId}/material-submission`.
- Sprint 5 collaboration snapshots preserve live text/annotations.

Main current gap:
- Student lesson visibility and material/submission access are tied to `scheduledEnd`; after the lesson expires, unfinished material work is no longer a durable homework entry.

---

## Scope Rules

- Reuse existing `Assignment` and `Submission` concepts. Add small missing fields/tables only where needed for recipients, due dates and assignment archive state.
- Do not build a second scoring system. `MaterialScoringService` remains the source of score/error data.
- Do not make group progress depend on collaboration websocket or Yjs presence.
- Do not require Redis for group progress delivery. Start with REST and the existing `/ws/lessons` single-node websocket event hub where useful.
- Do not make homework open LiveKit by default. Homework opens a focused material/workspace route.
- Do not expose one student's submission/progress to another student.
- Teacher/admin sees assignment progress for students they manage.
- Student sees only their own assignments and submissions.
- Keep UI compact and classroom-shaped; avoid a separate analytics dashboard in Sprint 6.
- Do not persist derived progress/status values that can be calculated from `Submission`.

---

## Target Files

Backend / api-gateway:
- Modify: `backend/api-gateway/src/main/resources/db/changelog/db.changelog-master.xml`
- Create: `backend/api-gateway/src/main/resources/db/changelog/2026-06-XX-001-homework-assignments.xml`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/entity/AssignmentEntity.kt`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/entity/AssignmentRecipientEntity.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/entity/SubmissionEntity.kt` only if needed for standalone assignment metadata
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/repo/DataRepo.kt`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/dto/AssignmentDto.kt`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/AssignmentService.kt`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/controller/AssignmentController.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/LessonMaterialStore.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/ScheduledLessonStore.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/realtime/LessonRealtimeMessages.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/realtime/LessonRealtimeHub.kt`
- Test: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/AssignmentControllerTest.kt`
- Test: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/service/AssignmentProgressServiceTest.kt`
- Test: update existing scheduled lesson/material/collaboration tests for post-lesson homework access.

Frontend:
- Modify: `frontend/web-app/src/shared/api/playsay.ts` after OpenAPI generation
- Create: `frontend/web-app/src/features/assignments/model/assignmentProgress.ts`
- Create: `frontend/web-app/src/features/assignments/model/assignmentProgress.test.ts`
- Create: `frontend/web-app/src/features/assignments/hooks/useAssignments.ts`
- Create: `frontend/web-app/src/features/assignments/ui/StudentAssignmentsPanel.tsx`
- Create: `frontend/web-app/src/features/assignments/ui/TeacherAssignmentsPanel.tsx`
- Create: `frontend/web-app/src/features/assignments/ui/AssignmentWorkspace.tsx`
- Modify: `frontend/web-app/src/features/classroom/ui/TeacherCollaborationPanel.tsx`
- Modify: `frontend/web-app/src/features/classroom/ui/MaterialSubmissionsMonitor.tsx`
- Modify: `frontend/web-app/src/features/schedule/ui/ScheduledLessonCard.tsx`
- Modify: `frontend/web-app/src/features/materials/ui/MaterialLibraryPanel.tsx`
- Modify: `frontend/web-app/src/shared/i18n/resources/ru.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/en.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/de.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/fr.ts`

CI / docs:
- Modify: `Jenkinsfile` only for rollout gate and smoke coverage, not new images.
- Modify: `scripts/smoke/sprint5-ui-smoke.mjs` or create `scripts/smoke/sprint6-homework-progress-smoke.mjs`
- Modify: `/Users/evgeniymednov/Documents/Projects/Play&Say/spec.md`
- Modify: `../playsay-infra/docs/runbook.md` only if Jenkins/dev-smoke operating steps change.

No new Helm charts are required for Sprint 6.

---

## Task 0: Branch And Baseline

- [ ] Create platform branch from latest `develop`.

```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform
git checkout develop
git pull --ff-only origin develop
git checkout -b codex/sprint-6-homework-progress
```

- [ ] Create infra branch only if Jenkins/runbook changes require it.

```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-infra
git checkout develop
git pull --ff-only origin develop
git checkout -b codex/sprint-6-homework-progress
```

- [ ] Verify baseline backend.

```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/backend
gradle :api-gateway:test --no-daemon --stacktrace --max-workers=1 -Dkotlin.compiler.execution.strategy=in-process
```

- [ ] Verify frontend through Jenkins Node 22 if local Node 24 tooling is still unstable.

- [ ] Confirm Sprint 5 smoke is still green on dev.

---

## Task 1: Assignment Persistence Model

- [ ] Extend `assignment` for durable homework/work items.

Suggested additions:
- `teacher_user_id uuid null`
- `source_lesson_id uuid null`
- `due_at timestamptz null`
- `status varchar(24) not null default 'ACTIVE'`
- `created_at` and `updated_at` already exist.

Rules:
- Existing scheduled lesson material work remains `type='MATERIAL_WORK'`.
- A lesson-derived homework assignment keeps `lesson_id` and may also store `source_lesson_id` if a separate durable assignment row is created.
- A standalone assigned task has `lesson_id=null`, `source_lesson_id=null`, `material_id not null`, `type='MATERIAL_WORK'`.
- `status` values: `ACTIVE`, `ARCHIVED`.

- [ ] Add `assignment_recipient`.

Suggested fields:
- `id uuid primary key`
- `assignment_id uuid not null`
- `student_user_id uuid not null`
- `assigned_at timestamptz not null`
- `due_at timestamptz null`
- `archived_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Rules:
- Unique `(assignment_id, student_user_id)`.
- Do not store recipient progress status. Not-started/draft/submitted is derived from the latest `Submission`.
- To hide a recipient assignment without deleting history, set `archived_at`.

- [ ] Migration must backfill existing scheduled material assignments enough for tests/dev data not to break.

- [ ] Tests.

Required:
- migration applies cleanly;
- unique recipient constraint;
- standalone assignment can exist without `lesson_id`;
- lesson assignment can have participants as recipients.

---

## Task 2: Backend Assignment API

- [ ] Add teacher/admin APIs.

Suggested endpoints:
- `POST /assignments`
- `GET /assignments`
- `GET /assignments/{assignmentId}`
- `POST /schedule/lessons/{lessonId}/homework`
- `GET /assignments/{assignmentId}/submissions`

Use cases:
- assign a material to one or more students outside a live lesson;
- turn a lesson material into homework for all or selected participants;
- review score/errors/submission progress for all recipients.

- [ ] Add student APIs.

Suggested endpoints:
- `GET /me/assignments`
- `GET /me/assignments/{assignmentId}`
- `GET /me/assignments/{assignmentId}/submission`
- `PUT /me/assignments/{assignmentId}/submission`

Rules:
- Student sees only assignments where they are a recipient.
- Student can save draft with `submitted=false`.
- Student can submit with `submitted=true`.
- Saving/submitting runs existing `MaterialScoringService`.

- [ ] Keep scheduled lesson endpoints compatible.

Existing endpoints remain:
- `GET /schedule/lessons/{lessonId}/material-submission`
- `PUT /schedule/lessons/{lessonId}/material-submission`
- `GET /schedule/lessons/{lessonId}/material-submissions`

Change:
- if a lesson-derived assignment/homework is active, student access to material/submission can continue after `scheduledEnd`, even though LiveKit/classroom join should remain closed.

- [ ] Tests.

Required:
- teacher assigns material as standalone homework;
- teacher turns ended/in-progress lesson material into homework;
- student sees assigned work after lesson end;
- student cannot see other students' assignments;
- teacher sees only managed assignments unless admin;
- save draft does not set `submittedAt`;
- submit sets `submittedAt`, score and errors count.

---

## Task 3: Lesson Carry-Over Homework

- [ ] Define carry-over behavior.

Default Sprint 6 behavior:
- Teacher can explicitly assign unfinished lesson material as homework.
- Assignment recipients default to lesson participants.
- If a student already has a scheduled lesson submission, reuse/update it under the durable assignment path.
- If a student has a Sprint 5 collaboration document snapshot but no final submission, the homework workspace can resume from that snapshot where possible.

- [ ] Access rules after lesson end.

Allowed after `scheduledEnd`:
- open homework material;
- load own homework submission;
- save draft;
- submit/finalize;
- teacher review submissions.

Not allowed after `scheduledEnd`:
- join LiveKit room as live lesson;
- treat the expired lesson as active classroom;
- access another student's document as student.

- [ ] Update `ScheduledLessonStore` and `LessonMaterialStore`.

Current problem:
- student schedule visibility excludes ended lessons;
- `accessibleScheduledMaterial` rejects participants after `scheduledEnd`.

Required:
- live lesson visibility remains time-bound;
- homework assignment visibility is assignment-bound;
- no regression to cancelled/completed lesson security.

- [ ] Tests.

Required:
- expired lesson is not joinable as live lesson;
- expired lesson homework remains visible in assignments;
- cancelled lesson does not leak homework unless teacher explicitly created assignment before cancellation and did not archive it;
- collaboration finalize after lesson end works only through valid assignment/homework access.

---

## Task 4: Group Progress Indicator From Existing Scoring

- [ ] Add pure progress summary model in backend.

Input:
- assignment recipient;
- latest submission;
- assignment max score;
- due date;
- current time.

Output fields:
- `showGroupIndicator: Boolean`
- `recipientCount`
- `hasSubmission`
- `isSubmitted`
- `score`
- `maxScore`
- `scoreRatio`
- `errorsCount`
- `submittedAt`
- `updatedAt`
- `groupAverageScore`
- `groupAverageErrorsCount`
- `relativeScoreDelta`
- `relativeErrorsDelta`
- `progressTone: 0..100` where `100` is green/best current state and `0` is red/worst current state

Rules:
- `showGroupIndicator=false` when `recipientCount <= 1`.
- Do not return a health/status enum.
- Do not persist progress summary rows.
- For group work, use score/errors deltas only to help teacher compare students quickly.
- Absence of submission means no score/errors yet; it is not a separate status.
- Absence of submission must not be rendered as `10/10`, green, or full progress.
- `progressTone` is calculated only when current scored answers exist.
- Submitted/draft state is represented by `submittedAt` and `isSubmitted`, not a label enum.

Use `content.assessment` when present:
- `errorsCount`
- `items[*].status`
- `items[*].incorrectAttempts`
- `items[*].hintsUsed`
- `score/maxScore`.

- [ ] Add DTOs for assignment progress.

Suggested:
- `AssignmentRecipientProgressResponse`
- `TeacherAssignmentProgressResponse`

- [ ] Add tests.

Required:
- one recipient -> `showGroupIndicator=false`;
- two or more recipients -> `showGroupIndicator=true`;
- no submission -> score/errors null and no derived status;
- draft -> `isSubmitted=false`;
- submitted -> `isSubmitted=true`;
- lower score/higher errors produces worse relative deltas, not a named status;
- progress never requires external service config.

---

## Task 5: Teacher UI

- [ ] Add assignment/homework panel.

Suggested placement:
- teacher workspace gets a compact "Assignments" section next to lessons/materials;
- material library gets "Assign" action;
- lesson/classroom gets "Assign as homework" action for current material.

- [ ] Update existing lesson supervision.

In `TeacherCollaborationPanel` and/or `MaterialSubmissionsMonitor`:
- show score/error comparison per student only when there is more than one student;
- keep document switching/editing unchanged;
- show all assignment recipients too, not only students with submissions.

- [ ] Add teacher review flow.

Minimum:
- assignment detail shows recipients;
- each row shows score, errors, last activity and submitted time;
- teacher can open latest submission/material state.

- [ ] Localize visible text for `ru/en/de/fr`.

- [ ] Tests.

Required:
- group-progress helper tests;
- single-student assignments do not render the group indicator;
- recipient rows include not-started students;
- no layout shift when score/error labels appear.

---

## Task 6: Student UI

- [ ] Add student assignments/homework list.

Minimum row content:
- material/assignment title;
- teacher;
- due date;
- score/errors when available;
- action: open/continue/submit.

- [ ] Add assignment workspace.

Rules:
- opens without LiveKit video;
- renders the same material task components;
- loads own draft/submission;
- saves draft;
- submits and shows automatic score/errors;
- if assignment came from a lesson collaboration document, restores available saved work/snapshot when possible.

- [ ] Preserve classroom UX.

Live lesson remains the first screen for active lesson work. Homework is a separate focused route/view and should not show video controls.

- [ ] Localize visible text for `ru/en/de/fr`.

- [ ] Tests.

Required:
- student sees assigned standalone task;
- student sees lesson carry-over homework after lesson end;
- student cannot open assignment for another student;
- save draft and submit update UI state.

---

## Task 7: Realtime And Refresh

- [ ] Keep initial implementation simple.

Required:
- teacher progress views load via REST;
- student save/submit returns updated submission in response;
- teacher screen can poll assignment progress every 5 seconds where existing code already polls submissions.

- [ ] Use existing `/ws/lessons` only where it is already natural.

Optional Sprint 6:
- publish `lesson.submission.updated` or `assignment.progress.updated` from `api-gateway` after save/submit/finalize;
- no Redis required.

- [ ] Tests.

Required:
- saving submission updates backend progress immediately;
- optional websocket messages are teacher-only;
- student does not receive other students' progress.

---

## Task 8: CI And Dev Smoke

- [ ] Keep existing build images.

No new app image is expected in Sprint 6. Jenkins still builds:
- api-gateway;
- web-app;
- collaboration-service.

- [ ] Add strict ArgoCD rollout gate before browser smoke.

Required:
- wait until ArgoCD apps `api-gateway`, `web-app`, `collaboration-service` are `Synced/Healthy` at the infra revision containing current `BUILD_LABEL`;
- verify pods carry images tagged with current `BUILD_LABEL`;
- only then run browser smoke.

- [ ] Extend smoke.

Add Sprint 6 smoke:
1. teacher creates material-backed assignment for Student A/B;
2. Student A sees assignment in homework list;
3. Student A saves a draft;
4. teacher sees Student A latest activity without a named progress status;
5. Student A submits with known wrong answers;
6. teacher sees Student A score/errors worse than Student B through the group progress indicator;
7. Student A fixes answers and resubmits;
8. teacher sees improved score/errors;
9. teacher creates/uses a live group lesson, leaves work unfinished, assigns it as homework;
10. student sees carry-over homework after the lesson is no longer joinable;
11. Sprint 5 collaboration smoke still passes.

- [ ] Keep Sprint 5 checks intact.

Do not remove coverage for:
- individual docs;
- group docs;
- teacher supervision/edit;
- cursors;
- annotations after scroll/resize;
- reconnect;
- finalize creates `Submission`.

---

## Task 9: Spec And Runbook Sync

- [ ] Update `spec.md`.

Record final Sprint 6 behavior:
- homework/assigned work model;
- lesson carry-over rules;
- assignment recipient permissions;
- group progress indicator from automatic scoring, shown only when more than one student is involved;
- no derived health/status enum;
- no Redis/LanguageTool/analysis-service in Sprint 6;
- Jenkins rollout gate.

- [ ] Update runbook only for operational changes.

Required if Jenkins smoke/gate changes:
- how to diagnose rollout gate failure;
- how to run Sprint 6 homework/progress smoke.

- [ ] Verify.

```bash
git diff --check
```

---

## End-To-End Dev Smoke

- [ ] Push platform branch.
- [ ] Push infra branch only if Jenkins/runbook changes are present.
- [ ] Trigger Jenkins branch deploy.
- [ ] Verify ArgoCD current build rollout.
- [ ] Run Sprint 5 smoke.
- [ ] Run Sprint 6 homework/progress smoke.
- [ ] Merge to `develop` only after smoke passes.

---

## Definition Of Done

- [ ] Teacher can assign material as standalone homework to selected students.
- [ ] Teacher can convert unfinished lesson material into homework for lesson participants.
- [ ] Student sees assigned homework after the live lesson window has ended.
- [ ] Student can open homework without LiveKit/video.
- [ ] Student can save draft and submit homework.
- [ ] Existing automatic scoring fills `score`, `errorsCount`, and `content.assessment`.
- [ ] Teacher sees all recipients, including not-started students.
- [ ] Teacher sees compact group progress comparison from existing score/errors when there is more than one student.
- [ ] Single-student assignments show normal score/errors only, without a separate health indicator.
- [ ] Student cannot read another student's assignment progress/submission.
- [ ] Expired lessons are not joinable as live lessons unless explicitly active, but their homework remains accessible.
- [ ] Sprint 5 collaboration flows still work.
- [ ] No Redis, LanguageTool, analysis-service, LLM bridge, or external checking service is added for Sprint 6.
- [ ] Backend tests pass.
- [ ] OpenAPI export passes and generated frontend client is committed.
- [ ] Frontend lint/test/build pass in Jenkins.
- [ ] Jenkins waits for current ArgoCD rollout before browser smoke.
- [ ] Sprint 6 homework/progress smoke passes on dev.
- [ ] `spec.md` and runbook are synchronized with final behavior.
