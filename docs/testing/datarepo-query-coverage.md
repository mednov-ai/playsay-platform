# DataRepo Query Coverage

This document tracks behavior coverage for repository methods in `backend/api-gateway/src/main/kotlin/com/playsay/gateway/repo/DataRepo.kt`.

## Local Verification

```bash
cd backend
gradle :api-gateway:test --no-daemon --stacktrace --max-workers=1
gradle :api-gateway:exportOpenApi --no-daemon --stacktrace --max-workers=1
```

Architecture checks:

```bash
rg -n "dataRepo\\.sql|LegacyJdbcDataRepo|JdbcClient|jdbcClient\\.sql" backend/api-gateway/src/main/kotlin backend/api-gateway/src/test/kotlin
rg -n "@Query" backend/api-gateway/src/main/kotlin/com/playsay/gateway --glob '*.kt'
```

Expected:
- no `JdbcClient`, `LegacyJdbcDataRepo`, `dataRepo.sql(...)` usage in production or tests;
- `@Query` appears only in `repo/DataRepo.kt`.

## Traceability Matrix

| Repo method | Primary local test | Controller/API behavior test | Stand smoke scenario | Risk covered |
| --- | --- | --- | --- | --- |
| `AppUserRepo.findByKeycloakSubject` | `DataRepoQueryCoverageTest.app user repository queries...` | `UserProfileControllerTest.creates and updates current app user profile` | `GET /users/me/profile` as teacher/student/admin | current user profile resolves stable app user row |
| `AppUserRepo.findByKeycloakSubjectIn` | `DataRepoQueryCoverageTest.app user repository queries...` | `ScheduledLessonControllerTest.teacher schedules lesson with participant` | schedule lesson with `participantSubjects` | participants attach to existing users by subject |
| `AppUserRepo.findAllOrdered` | `DataRepoQueryCoverageTest.app user repository queries...` | `UserProfileControllerTest.admin can list known profiles` | `GET /admin/users` as admin | deterministic admin user list |
| `AppUserRepo.findByRoleOrdered` | `DataRepoQueryCoverageTest.app user repository queries...` | `UserProfileControllerTest.teacher can list known student profiles` | `GET /users/students` as teacher | student picker excludes teachers/admins |
| `CourseRepo.findCourseSummaries` | `DataRepoQueryCoverageTest.course and lesson template repository queries...` | `CourseControllerTest.course list returns all courses for teacher and only published for student` | `GET /courses` as teacher | teacher sees all courses with lesson counts |
| `CourseRepo.findPublishedCourseSummaries` | `DataRepoQueryCoverageTest.course and lesson template repository queries...` | `CourseControllerTest.course list returns all courses for teacher and only published for student` | `GET /courses` as student | students do not see draft courses |
| `CourseRepo.findCourseSummaryById` | `DataRepoQueryCoverageTest.course and lesson template repository queries...` | `CourseControllerTest.teacher creates course and course lessons` | `GET /courses/{courseId}` | single course returns correct lesson count |
| `LessonTemplateRepo.deleteByCourseId` | `DataRepoQueryCoverageTest.course and lesson template repository queries...` | `CourseControllerTest.delete course removes its lessons` | delete test course or cleanup by UI/API | course removal cleans lesson templates |
| `LessonTemplateRepo.deleteByIdAndCourseId` | `DataRepoQueryCoverageTest.course and lesson template repository queries...` | `CourseControllerTest.teacher updates and deletes course lesson` | `DELETE /courses/{courseId}/lessons/{lessonId}` | scoped lesson-template delete cannot remove another course lesson |
| `LessonTemplateRepo.findByIdAndCourseId` | `DataRepoQueryCoverageTest.course and lesson template repository queries...` | `CourseControllerTest.teacher updates and deletes course lesson` | update a course lesson | update/delete resolves lesson only inside course |
| `LessonTemplateRepo.findLessonRowsByCourseId` | `DataRepoQueryCoverageTest.course and lesson template repository queries...` | `CourseControllerTest.course lesson list keeps order and material title projection` | `GET /courses/{courseId}/lessons` | lesson order and material title joins survive refactor |
| `LessonTemplateRepo.findLessonRowByCourseIdAndId` | `DataRepoQueryCoverageTest.course and lesson template repository queries...` | `CourseControllerTest.course lesson list keeps order and material title projection` | update/read linked course lesson | single lesson row has material projection |
| `LessonRepo.findScheduleRowsForManager` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.student does not see cancelled completed or expired scheduled lessons` | `GET /schedule/lessons` as teacher | manager sees complete schedule including inactive lessons |
| `LessonRepo.findScheduleRowsForStudent` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.student sees only own scheduled lessons` | `GET /schedule/lessons` as assigned and other student | students see only own active lessons |
| `LessonRepo.findScheduleRowById` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.scheduled lesson uses direct material before template material...` | `GET /schedule/lessons/{lessonId}` | schedule detail has course, lesson, teacher, material fields |
| `LessonRepo.findJoinableForManager` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.teacher and participant receive LiveKit room token` | `POST /schedule/lessons/{lessonId}/room-token` as teacher | teacher can join active lesson only |
| `LessonRepo.findJoinableForStudent` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.non participant cannot receive LiveKit room token` | room token as assigned/non-assigned student | student join access is participant-scoped |
| `LessonRepo.findByLivekitRoomName` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.LiveKit webhook marks participant attendance` | LiveKit webhook or local webhook simulation | attendance update resolves lesson by room |
| `LessonRepo.findScheduledMaterialLookup` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.scheduled lesson uses direct material before template material...` | `GET /schedule/lessons/{lessonId}/material` | `coalesce(lesson.materialId, template.materialId)` behavior |
| `LessonRepo.countActiveMaterialParticipant` | `DataRepoQueryCoverageTest.lesson material repository queries...` | `MaterialControllerTest.student sees private material through assigned scheduled lesson` | assigned private material read in lesson | private material is visible only through active participant lesson |
| `LessonParticipantRepo.deleteByLessonId` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.teacher updates and deletes scheduled lesson` | update lesson participants | participant replacement/deletion stays scoped to lesson |
| `LessonParticipantRepo.findByLessonId` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.LiveKit webhook marks participant attendance` | teacher monitor/attendance check | attendance timestamps/status are persisted |
| `LessonParticipantRepo.findParticipantRowsByLessonIds` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.teacher schedules lesson with participant` | schedule list as teacher | participant response projection has names/status |
| `LessonParticipantRepo.countByLessonIdAndStudentSubject` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.non participant cannot receive LiveKit room token` | non-participant token denial | participant checks are by subject |
| `LessonParticipantRepo.findByRoomNameAndStudentSubject` | `DataRepoQueryCoverageTest.lesson and participant repository queries...` | `ScheduledLessonControllerTest.LiveKit webhook marks participant attendance` | LiveKit participant joined/left webhook | webhook attendance updates right participant |
| `AssignmentRepo.findFirstByLessonIdAndMaterialIdAndMaterialBlockIdIsNullAndTypeOrderByCreatedAtAsc` | `DataRepoQueryCoverageTest.assignment and submission repository queries...` | `MaterialControllerTest.first classroom material state returns empty submission and annotation` | first material submission read/save | material work assignment is reused, not duplicated |
| `SubmissionRepo.findFirstByAssignmentIdAndLessonIdAndStudentUserIdOrderByUpdatedAtDesc` | `DataRepoQueryCoverageTest.assignment and submission repository queries...` | `MaterialControllerTest.student sees private material through assigned scheduled lesson` | repeated submission save/read as student | latest student snapshot wins |
| `SubmissionRepo.findMaterialSubmissionRows` | `DataRepoQueryCoverageTest.assignment and submission repository queries...` | `MaterialControllerTest.student sees private material through assigned scheduled lesson` | teacher monitor submissions | teacher monitor sees student answers |
| `SubmissionRepo.findMaterialSubmissionRowsByStudent` | `DataRepoQueryCoverageTest.assignment and submission repository queries...` | `MaterialControllerTest.student sees private material through assigned scheduled lesson` | `GET /material-submission` as student | student reads only own snapshot |
| `SubmissionRepo.findMaterialSubmissionRowById` | `DataRepoQueryCoverageTest.assignment and submission repository queries...` | `MaterialControllerTest.student sees private material through assigned scheduled lesson` | teacher monitor selected submission | submission projection has user/material fields |
| `LessonMaterialRepo.existsByIdAndStatusNot` | `DataRepoQueryCoverageTest.lesson material repository queries...` | `CourseControllerTest.course lesson list keeps order and material title projection` | link material to course lesson | archived materials are rejected for linking |
| `LessonMaterialRepo.countVisibleActiveForUser` | `DataRepoQueryCoverageTest.lesson material repository queries...` | `MaterialControllerTest.teacher cannot attach another teacher private material` | attach private material as other teacher | material link validation respects owner/public visibility |
| `LessonMaterialRepo.findRowsForAdmin` | `DataRepoQueryCoverageTest.lesson material repository queries...` | `MaterialControllerTest.material list respects admin teacher student visibility...` | `GET /materials` as admin | admin sees all non-archived materials |
| `LessonMaterialRepo.findRowsForTeacher` | `DataRepoQueryCoverageTest.lesson material repository queries...` | `MaterialControllerTest.material list respects admin teacher student visibility...` | `GET /materials` as owner teacher | teacher sees own plus public materials |
| `LessonMaterialRepo.findPublicPublishedRows` | `DataRepoQueryCoverageTest.lesson material repository queries...` | `MaterialControllerTest.material list respects admin teacher student visibility...` | `GET /materials` as student | student sees public published materials only |
| `LessonMaterialRepo.findRowById` | `DataRepoQueryCoverageTest.lesson material repository queries...` | `MaterialControllerTest.teacher creates private material and can publish it publicly` | `GET /materials/{materialId}` | material detail projection has owner and document fields |
| `MaterialAssetRepo.findByMaterialId` | `DataRepoQueryCoverageTest.asset and annotation repository queries...` | `MaterialControllerTest.teacher generates missing matching pair images and preserves row order` | `GET /materials/{materialId}/assets` | asset list is material-scoped |
| `MaterialAssetRepo.findByMaterialIdOrderByCreatedAtDesc` | `DataRepoQueryCoverageTest.asset and annotation repository queries...` | `MaterialControllerTest.teacher generates missing matching pair images and preserves row order` | asset list after image generation | newest asset order remains stable |
| `MaterialAssetRepo.deleteByIdAndMaterialId` | `DataRepoQueryCoverageTest.asset and annotation repository queries...` | `MaterialControllerTest.teacher generates missing matching pair images and preserves row order` | regenerate/edit generated asset metadata | asset delete/update is scoped to material |
| `LessonMaterialAnnotationRepo.findByLessonIdAndMaterialId` | `DataRepoQueryCoverageTest.asset and annotation repository queries...` | `MaterialControllerTest.student sees private material through assigned scheduled lesson` | save/read scheduled lesson annotation | annotation is shared per lesson/material pair |

## Stand API Smoke

The repeatable script is `scripts/smoke/datarepo-api-smoke.sh`.

Required environment variables:

```bash
export PLAY_SAY_API_BASE_URL="https://online.play-and-say.ru/api"
export PLAY_SAY_TEACHER_TOKEN="<teacher bearer token>"
export PLAY_SAY_STUDENT_TOKEN="<student bearer token>"
export PLAY_SAY_OTHER_STUDENT_TOKEN="<other student bearer token>"
export PLAY_SAY_ADMIN_TOKEN="<admin bearer token>"
```

Run:

```bash
scripts/smoke/datarepo-api-smoke.sh
```

Expected:
- no unexpected `5xx`;
- teacher can create material/course/lesson and monitor submission;
- assigned student can see scheduled lesson material and save answers;
- other student cannot see assigned private lesson/material;
- cancelled lesson denies a new room token.

## Playwright Stand Smoke

Use local agent Playwright without adding a project dependency:

```bash
/Users/evgeniymednov/.codex/tools/playwright/node_modules/.bin/playwright --version
```

Manual/ad-hoc scenario after deploy:

1. Open `https://online.play-and-say.ru/`.
2. Login as teacher.
3. Open profile, materials, courses, schedule.
4. Create a material, link it to a course lesson, schedule it for a student.
5. Login as assigned student in a fresh context.
6. Enter the lesson and verify material workspace renders.
7. Save/submit one answer.
8. Return as teacher, verify submissions monitor shows the student snapshot.
9. Cancel the lesson.
10. Verify student join/token flow is denied or the UI clearly shows cancelled state.
11. Repeat student lesson/material view at `390x844` viewport.
12. Save screenshots:
    - `artifacts/smoke/teacher-datarepo-flow.png`
    - `artifacts/smoke/student-datarepo-flow.png`
    - `artifacts/smoke/teacher-monitor-cancelled.png`
    - `artifacts/smoke/student-mobile-material.png`

## Acceptance Criteria

- Every method in `DataRepo.kt` has direct local coverage.
- Role-sensitive and visibility-sensitive queries have controller/API behavior coverage.
- Stand smoke covers teacher login, student login, lesson assignment, student lesson entry, material submission, teacher monitor, cancellation and material/course linkage.
- `JdbcClient`, `LegacyJdbcDataRepo`, and `dataRepo.sql(...)` remain absent.
- `@Query` remains isolated in `repo/DataRepo.kt`.
