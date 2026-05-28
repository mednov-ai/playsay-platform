# DataRepo Query Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** покрыть поведение всех persistence-запросов, перенесённых в `backend/api-gateway/src/main/kotlin/com/playsay/gateway/repo/DataRepo.kt`, локальными backend-тестами и стендовыми API/Playwright smoke-сценариями.

**Architecture:** основной контроль даёт новый repo-level integration test, который напрямую вызывает каждый метод из `DataRepo.kt` на детерминированных фикстурах. Controller/API tests проверяют, что те же запросы правильно работают через публичные endpoint-ы и role/visibility-правила. Стендовый smoke проверяет реальный деплой, Keycloak-токены, API и browser flow без прямого доступа к БД.

**Tech Stack:** Kotlin, Spring Boot Test, JUnit 5, H2 PostgreSQL mode, Liquibase, Spring Data JPA, Gradle, generated OpenAPI contract, curl/Playwright for dev stand smoke.

---

## Coverage Map

### `AppUserRepo`

- `findByKeycloakSubject`
- `findByKeycloakSubjectIn`
- `findAllOrdered`
- `findByRoleOrdered`

Required coverage:
- local repo test with users `admin`, `student`, `teacher`;
- controller coverage through `/users/me/profile`, `/admin/users`, `/users/students`;
- stand API smoke verifies teacher can see students and admin can list profiles.

### `CourseRepo`

- `findCourseSummaries`
- `findPublishedCourseSummaries`
- `findCourseSummaryById`

Required coverage:
- local repo test with published/draft courses and lesson-template counts;
- controller coverage through `/courses` for teacher vs student and `/courses/{courseId}`;
- stand API smoke creates published and draft courses, then checks role-dependent listing.

### `LessonTemplateRepo`

- `deleteByCourseId`
- `deleteByIdAndCourseId`
- `findByIdAndCourseId`
- `findLessonRowsByCourseId`
- `findLessonRowByCourseIdAndId`

Required coverage:
- local repo test verifies ordered lesson rows and material title join;
- controller coverage through course lesson create/update/delete/list;
- stand API smoke creates course lessons linked to material, updates order/duration, deletes one lesson.

### `LessonRepo`

- `findScheduleRowsForManager`
- `findScheduleRowsForStudent`
- `findScheduleRowById`
- `findJoinableForManager`
- `findJoinableForStudent`
- `findByLivekitRoomName`
- `findScheduledMaterialLookup`
- `countActiveMaterialParticipant`

Required coverage:
- local repo test with future, expired, cancelled, completed, direct-material and template-material lessons;
- controller coverage through schedule list/get/update/delete and LiveKit token endpoint;
- stand API smoke schedules lessons for two students and verifies visibility, material inheritance and live join access.

### `LessonParticipantRepo`

- `deleteByLessonId`
- `findByLessonId`
- `findParticipantRowsByLessonIds`
- `countByLessonIdAndStudentSubject`
- `findByRoomNameAndStudentSubject`

Required coverage:
- local repo test with two lessons, multiple participants, attendance status, joined/left timestamps;
- controller coverage through schedule participant responses and LiveKit webhook attendance update;
- stand API smoke verifies participant-specific access and non-participant denial.

### `AssignmentRepo`

- `findFirstByLessonIdAndMaterialIdAndMaterialBlockIdIsNullAndTypeOrderByCreatedAtAsc`

Required coverage:
- local repo test with two assignments for same lesson/material/type and createdAt order;
- controller coverage through first scheduled material submission read/save;
- stand API smoke calls material submission twice and verifies same assignment/submission path is reused.

### `SubmissionRepo`

- `findFirstByAssignmentIdAndLessonIdAndStudentUserIdOrderByUpdatedAtDesc`
- `findMaterialSubmissionRows`
- `findMaterialSubmissionRowsByStudent`
- `findMaterialSubmissionRowById`

Required coverage:
- local repo test with two students and multiple submissions ordered by `updatedAt`;
- controller coverage through student save/read and teacher monitor list;
- stand API smoke saves a student answer and checks teacher monitor sees it while student monitor endpoint returns 403.

### `LessonMaterialRepo`

- `existsByIdAndStatusNot`
- `countVisibleActiveForUser`
- `findRowsForAdmin`
- `findRowsForTeacher`
- `findPublicPublishedRows`
- `findRowById`

Required coverage:
- local repo test with owner-private, other-private, public-published, archived and draft materials;
- controller coverage through `/materials`, `/materials/{id}`, course material attach validation and schedule material attach validation;
- stand API smoke verifies teacher owner view, other teacher restrictions, student public visibility and assigned private material access.

### `MaterialAssetRepo`

- `findByMaterialId`
- `findByMaterialIdOrderByCreatedAtDesc`
- `deleteByIdAndMaterialId`

Required coverage:
- local repo test with three assets across two materials and deterministic `createdAt`;
- controller coverage through image generation/list/update/content;
- stand API smoke lists material assets and fetches asset content after generation.

### `LessonMaterialAnnotationRepo`

- `findByLessonIdAndMaterialId`

Required coverage:
- local repo test with annotation for one scheduled lesson/material pair;
- controller coverage through scheduled material annotation get/save;
- stand API smoke saves annotation as student and reads it as teacher.

---

## Files

- Create: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/repo/DataRepoQueryCoverageTest.kt`
- Modify: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/UserProfileControllerTest.kt`
- Modify: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/CourseControllerTest.kt`
- Modify: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/ScheduledLessonControllerTest.kt`
- Modify: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/MaterialControllerTest.kt`
- Create: `docs/testing/datarepo-query-coverage.md`
- Optional create, if we want repeatable stand checks: `scripts/smoke/datarepo-api-smoke.sh`
- Optional create, if we want browser coverage committed later: `frontend/web-app/e2e/datarepo-regression.spec.ts`

---

## Task 1: Add Direct Repo Coverage Test

**Files:**
- Create: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/repo/DataRepoQueryCoverageTest.kt`

- [ ] **Step 1: Create the test shell**

Create a Spring Boot test with the same H2/Liquibase setup used by controller tests:

```kotlin
package com.playsay.gateway.repo

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.entity.*
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:datarepo-query-coverage;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DataRepoQueryCoverageTest @Autowired constructor(
    private val appUserRepo: AppUserRepo,
    private val courseRepo: CourseRepo,
    private val lessonTemplateRepo: LessonTemplateRepo,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val assignmentRepo: AssignmentRepo,
    private val submissionRepo: SubmissionRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val materialAssetRepo: MaterialAssetRepo,
    private val lessonMaterialAnnotationRepo: LessonMaterialAnnotationRepo,
    private val dataSource: DataSource,
) {
    private val mapper = jacksonObjectMapper()

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@DataRepoQueryCoverageTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        lessonMaterialAnnotationRepo.deleteAllInBatch()
        materialAssetRepo.deleteAllInBatch()
        submissionRepo.deleteAllInBatch()
        assignmentRepo.deleteAllInBatch()
        lessonParticipantRepo.deleteAllInBatch()
        lessonRepo.deleteAllInBatch()
        lessonTemplateRepo.deleteAllInBatch()
        courseRepo.deleteAllInBatch()
        lessonMaterialRepo.deleteAllInBatch()
        appUserRepo.deleteAllInBatch()
    }
}
```

- [ ] **Step 2: Run the empty test class**

Run:

```bash
cd backend
gradle :api-gateway:test --tests 'com.playsay.gateway.repo.DataRepoQueryCoverageTest' --no-daemon --stacktrace --max-workers=1
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Add fixture helpers**

Inside `DataRepoQueryCoverageTest`, add private helpers:

```kotlin
private fun user(
    subject: String,
    username: String,
    roles: String,
    displayName: String? = null,
): AppUserEntity =
    appUserRepo.saveAndFlush(
        AppUserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = subject,
            username = username,
            email = "$username@example.com",
            name = displayName ?: username,
            roles = roles,
            displayName = displayName,
            createdAt = Instant.parse("2026-05-20T10:00:00Z"),
            updatedAt = Instant.parse("2026-05-20T10:00:00Z"),
        ),
    )

private fun material(
    owner: AppUserEntity?,
    title: String,
    visibility: String,
    status: String,
    updatedAt: Instant = Instant.parse("2026-05-20T10:00:00Z"),
): LessonMaterialEntity =
    lessonMaterialRepo.saveAndFlush(
        LessonMaterialEntity(
            id = UUID.randomUUID(),
            ownerTeacherUserId = owner?.id,
            title = title,
            description = "$title description",
            language = "en",
            cefrLevel = "A1",
            visibility = visibility,
            status = status,
            document = """{"schemaVersion":1,"pages":[]}""",
            sourceMeta = "{}",
            scoringRubric = """{"maxScore":10}""",
            createdAt = updatedAt.minusSeconds(60),
            updatedAt = updatedAt,
        ),
    )

private fun course(title: String, published: Boolean, creator: AppUserEntity): CourseEntity =
    courseRepo.saveAndFlush(
        CourseEntity(
            id = UUID.randomUUID(),
            title = title,
            description = "$title description",
            language = "en",
            level = "A1",
            isPublished = published,
            createdByUserId = creator.id,
            createdAt = Instant.parse("2026-05-20T10:00:00Z"),
            updatedAt = Instant.parse("2026-05-20T10:00:00Z"),
        ),
    )

private fun lessonTemplate(
    course: CourseEntity,
    title: String,
    material: LessonMaterialEntity? = null,
    orderIndex: Int? = null,
): LessonTemplateEntity =
    lessonTemplateRepo.saveAndFlush(
        LessonTemplateEntity(
            id = UUID.randomUUID(),
            courseId = course.id,
            title = title,
            orderIndex = orderIndex,
            plannedDurationMin = 45,
            materialId = material?.id,
            createdAt = Instant.parse("2026-05-20T10:00:00Z"),
            updatedAt = Instant.parse("2026-05-20T10:00:00Z"),
        ),
    )
```

If entity constructor signatures differ during implementation, use the actual current entity fields from `backend/api-gateway/src/main/kotlin/com/playsay/gateway/entity/*.kt`.

- [ ] **Step 4: Add `app user repository queries`**

Add test:

```kotlin
@Test
fun `app user repository queries cover subject lookup bulk lookup ordering and role filtering`() {
    user(subject = "teacher-1", username = "z.teacher", roles = "TEACHER", displayName = "Teacher Z")
    user(subject = "student-1", username = "a.student", roles = "STUDENT", displayName = "Student A")
    user(subject = "admin-1", username = "m.admin", roles = "ADMIN", displayName = "Admin M")

    assertEquals("a.student", appUserRepo.findByKeycloakSubject("student-1")?.username)
    assertEquals(
        setOf("student-1", "teacher-1"),
        appUserRepo.findByKeycloakSubjectIn(listOf("student-1", "teacher-1")).map { it.keycloakSubject }.toSet(),
    )
    assertEquals(listOf("a.student", "m.admin", "z.teacher"), appUserRepo.findAllOrdered().map { it.username })
    assertEquals(listOf("a.student"), appUserRepo.findByRoleOrdered("STUDENT").map { it.username })
}
```

- [ ] **Step 5: Add `course and lesson template repository queries`**

Add test that creates a published course, a draft course, two lesson templates and one linked material. Assert:
- `findCourseSummaries()` returns both courses;
- `findPublishedCourseSummaries()` returns only published;
- `findCourseSummaryById(published.id)?.lessonCount == 2L`;
- `findLessonRowsByCourseId(published.id)` returns lessons ordered by `orderIndex`;
- row contains joined `materialTitle`;
- `findLessonRowByCourseIdAndId` returns the expected row;
- `findByIdAndCourseId` returns entity;
- `deleteByIdAndCourseId` returns `1`;
- `deleteByCourseId` returns remaining lesson count.

- [ ] **Step 6: Add `lesson repository schedule visibility queries`**

Add test that creates:
- teacher;
- student one;
- student two;
- course + template;
- direct material;
- template material;
- future lesson with participant student one;
- future lesson with participant student two;
- expired lesson;
- cancelled lesson.

Assert:
- `findScheduleRowsForManager()` sees all lessons;
- `findScheduleRowsForStudent("student-1", now, listOf("CANCELLED", "COMPLETED"))` sees only student one's future non-cancelled lesson;
- `findScheduleRowById(future.id)` returns course title, lesson title and material title;
- `findScheduledMaterialLookup(future.id)` returns direct material if present;
- `findScheduledMaterialLookup(templateOnly.id)` returns template material through `coalesce`;
- `findJoinableForManager(future.id, now, excluded)` returns lesson;
- `findJoinableForStudent(future.id, "student-1", now, excluded)` returns lesson;
- `findJoinableForStudent(future.id, "student-2", now, excluded)` returns null;
- `findByLivekitRoomName("lesson-${future.id}")` returns future lesson;
- `countActiveMaterialParticipant(material.id, "student-1", now, excluded) == 1L`.

- [ ] **Step 7: Add `lesson participant repository queries`**

In the same or separate test, assert:
- `findParticipantRowsByLessonIds(listOf(lesson.id))` returns student subjects ordered by display name;
- `countByLessonIdAndStudentSubject(lesson.id, "student-1") == 1L`;
- `findByRoomNameAndStudentSubject(roomName, "student-1")` returns the participant after `lesson.livekitRoomName` is set;
- `findByLessonId(lesson.id).single().attendanceStatus` matches fixture;
- `deleteByLessonId(lesson.id)` returns deleted count.

- [ ] **Step 8: Add `assignment and submission repository queries`**

Create one assignment and two submissions for the same student with different `updatedAt`, plus one submission for another student. Assert:
- `findFirstByLessonIdAndMaterialIdAndMaterialBlockIdIsNullAndTypeOrderByCreatedAtAsc(...)` returns earliest assignment;
- `findFirstByAssignmentIdAndLessonIdAndStudentUserIdOrderByUpdatedAtDesc(...)` returns latest student submission;
- `findMaterialSubmissionRows(assignment.id, lesson.id)` returns both students;
- `findMaterialSubmissionRowsByStudent(...)` returns only requested student;
- `findMaterialSubmissionRowById(submission.id)` includes `userSubject`, `userName`, `score`, `errorsCount`.

- [ ] **Step 9: Add `lesson material repository visibility queries`**

Create:
- owner teacher material: `PRIVATE/PUBLISHED`;
- owner draft: `PRIVATE/DRAFT`;
- other teacher private material;
- public published material;
- archived material.

Assert:
- `existsByIdAndStatusNot(public.id, "ARCHIVED")` is true;
- `existsByIdAndStatusNot(archived.id, "ARCHIVED")` is false;
- `countVisibleActiveForUser(ownerPrivate.id, owner.id, "ARCHIVED", "PUBLIC", "PUBLISHED") == 1L`;
- `countVisibleActiveForUser(otherPrivate.id, owner.id, ...) == 0L`;
- `findRowsForAdmin("ARCHIVED")` excludes archived;
- `findRowsForTeacher(owner.id, "ARCHIVED", "PUBLIC", "PUBLISHED")` includes owner materials plus public published, excludes other private;
- `findPublicPublishedRows("PUBLIC", "PUBLISHED")` includes only public published;
- `findRowById(ownerPrivate.id)?.ownerTeacherSubject == "teacher-1"`.

- [ ] **Step 10: Add `asset and annotation repository queries`**

Create assets for two materials with distinct `createdAt`. Assert:
- `findByMaterialId(material.id)` returns only that material's assets;
- `findByMaterialIdOrderByCreatedAtDesc(material.id)` returns newest first;
- `deleteByIdAndMaterialId(asset.id, material.id) == 1L`;
- `deleteByIdAndMaterialId(assetFromOtherMaterial.id, material.id) == 0L`.

Create an annotation for lesson/material. Assert:
- `findByLessonIdAndMaterialId(lesson.id, material.id)` returns the annotation;
- lookup for a wrong material returns null.

- [ ] **Step 11: Run direct repo coverage test**

Run:

```bash
cd backend
gradle :api-gateway:test --tests 'com.playsay.gateway.repo.DataRepoQueryCoverageTest' --no-daemon --stacktrace --max-workers=1
```

Expected: `BUILD SUCCESSFUL`.

---

## Task 2: Tighten Existing Controller Tests Around Repo Queries

**Files:**
- Modify: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/UserProfileControllerTest.kt`
- Modify: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/CourseControllerTest.kt`
- Modify: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/ScheduledLessonControllerTest.kt`
- Modify: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/MaterialControllerTest.kt`

- [ ] **Step 1: User profile controller coverage**

Add/extend assertions:
- admin list order is deterministic and based on `coalesce(username, subject)`;
- teacher student list excludes teacher/admin users and includes only `STUDENT` role.

Run:

```bash
cd backend
gradle :api-gateway:test --tests 'com.playsay.gateway.UserProfileControllerTest' --no-daemon --stacktrace --max-workers=1
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Course controller coverage**

Add/extend assertions:
- teacher `/courses` response includes draft and published with correct lesson counts;
- student `/courses` response includes only published;
- lesson list with linked material returns `materialTitle`;
- deleting one course lesson removes only that lesson;
- deleting a course removes all course lessons.

Run:

```bash
cd backend
gradle :api-gateway:test --tests 'com.playsay.gateway.CourseControllerTest' --no-daemon --stacktrace --max-workers=1
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Scheduled lesson controller coverage**

Add/extend assertions:
- manager sees expired/cancelled/completed lessons; student does not;
- student cannot get another student's lesson by id;
- direct material takes precedence over template material;
- template material is inherited when direct material is null;
- LiveKit token is denied for cancelled/completed/expired lessons;
- webhook updates `actualStart`, `joinedAt`, `leftAt`, `attendanceStatus`.

Run:

```bash
cd backend
gradle :api-gateway:test --tests 'com.playsay.gateway.ScheduledLessonControllerTest' --no-daemon --stacktrace --max-workers=1
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Material controller coverage**

Add/extend assertions:
- admin sees all non-archived materials;
- teacher sees own private/draft/published plus public published, but not another teacher private material;
- student sees public published only unless material is assigned to their active scheduled lesson;
- archived material is hidden;
- asset list order is newest first;
- asset metadata update does not leak access across material ids;
- first submission creates assignment, second submission updates the same student snapshot path;
- teacher monitor sees student submissions, student monitor returns 403;
- annotation get/save works for scheduled lesson material.

Run:

```bash
cd backend
gradle :api-gateway:test --tests 'com.playsay.gateway.MaterialControllerTest' --no-daemon --stacktrace --max-workers=1
```

Expected: `BUILD SUCCESSFUL`.

---

## Task 3: Add Coverage Documentation And Traceability Matrix

**Files:**
- Create: `docs/testing/datarepo-query-coverage.md`

- [ ] **Step 1: Document local coverage**

Create a markdown matrix with columns:
- `Repo method`
- `Primary repo test`
- `Controller/API behavior test`
- `Stand smoke scenario`
- `Risk covered`

Every method listed in the Coverage Map must have a non-empty row.

- [ ] **Step 2: Add verification commands**

Document:

```bash
cd backend
gradle :api-gateway:test --no-daemon --stacktrace --max-workers=1
gradle :api-gateway:exportOpenApi --no-daemon --stacktrace --max-workers=1
```

If frontend smoke is executed locally:

```bash
npm --workspace web-app run generate
npm --workspace web-app run build
```

- [ ] **Step 3: Add acceptance criteria**

Acceptance criteria:
- every `DataRepo.kt` method is covered by at least one local test;
- every role/visibility-sensitive query has controller/API coverage;
- stage smoke covers teacher schedule, student lesson entry, material submission, teacher monitor and cancellation;
- no production/test `JdbcClient` usage remains;
- `@Query` remains only in `repo/DataRepo.kt`.

---

## Task 4: Stand API Smoke Plan

**Files:**
- Optional create: `scripts/smoke/datarepo-api-smoke.sh`
- Modify docs only if script is not created: `docs/testing/datarepo-query-coverage.md`

- [ ] **Step 1: Prepare smoke inputs**

Use environment variables, never commit credentials:

```bash
export PLAY_SAY_BASE_URL="https://online.play-and-say.ru"
export PLAY_SAY_API_BASE_URL="https://online.play-and-say.ru/api"
export PLAY_SAY_TEACHER_TOKEN="<teacher bearer token>"
export PLAY_SAY_STUDENT_TOKEN="<student bearer token>"
export PLAY_SAY_OTHER_STUDENT_TOKEN="<other student bearer token>"
export PLAY_SAY_ADMIN_TOKEN="<admin bearer token>"
```

- [ ] **Step 2: API sequence**

Run these requests in order:

1. `GET /users/me/profile` as teacher, student, admin.
2. `GET /users/students` as teacher.
3. `GET /admin/users` as admin.
4. `POST /materials` as teacher: create private published material with fill-gap document.
5. `POST /materials` as teacher: create public published material.
6. `GET /materials` as teacher: expect private + public.
7. `GET /materials` as student: expect only public.
8. `POST /courses` as teacher: create published course.
9. `POST /courses/{courseId}/lessons` as teacher: attach private material.
10. `GET /courses` as student: expect published course.
11. `POST /schedule/lessons` as teacher: assign student to course lesson.
12. `GET /schedule/lessons` as teacher: expect lesson.
13. `GET /schedule/lessons` as assigned student: expect lesson.
14. `GET /schedule/lessons` as other student: expect no lesson.
15. `GET /schedule/lessons/{lessonId}/material` as assigned student: expect private material.
16. `GET /materials/{privateMaterialId}` as assigned student: expect 404 for direct read if material is private.
17. `GET /schedule/lessons/{lessonId}/material-submission` as student: expect empty submission.
18. `PUT /schedule/lessons/{lessonId}/material-submission` as student: save answer.
19. `GET /schedule/lessons/{lessonId}/material-submissions` as teacher: expect one submission.
20. `GET /schedule/lessons/{lessonId}/material-submissions` as student: expect 403.
21. `PUT /schedule/lessons/{lessonId}/material-annotation` as student.
22. `GET /schedule/lessons/{lessonId}/material-annotation` as teacher.
23. `POST /livekit/rooms/{lessonId}/token` or current generated OpenAPI path as teacher and student: expect room token.
24. `PUT /schedule/lessons/{lessonId}` as teacher: set status `CANCELLED`.
25. Repeat LiveKit token request as student: expect 404.

- [ ] **Step 3: Verify API smoke**

Expected:
- all 2xx/4xx responses match the sequence above;
- no 5xx responses;
- lesson/material/course ids are captured and reused;
- created data has a unique prefix such as `repo-smoke-2026-05-28-<timestamp>` for manual cleanup.

---

## Task 5: Playwright Stand Smoke Plan

**Files:**
- Optional create later: `frontend/web-app/e2e/datarepo-regression.spec.ts`
- Use local agent Playwright binary for ad-hoc execution without adding project dependency:
  `/Users/evgeniymednov/.codex/tools/playwright/node_modules/.bin/playwright`

- [ ] **Step 1: Teacher browser flow**

Open `https://online.play-and-say.ru/`:
- login as teacher;
- open profile and verify language/profile area renders;
- open materials;
- create or verify test material visible;
- open courses;
- create course and link material;
- open schedule;
- create lesson with student participant;
- open lesson/classroom and verify material workspace loads;
- capture screenshot `artifacts/smoke/teacher-datarepo-flow.png`.

- [ ] **Step 2: Student browser flow**

Open a fresh browser context:
- login as assigned student;
- verify schedule shows assigned lesson;
- enter lesson;
- verify private assigned material is visible inside scheduled lesson;
- fill one answer and save/submit;
- verify no console errors;
- capture screenshot `artifacts/smoke/student-datarepo-flow.png`.

- [ ] **Step 3: Teacher monitor and cancellation flow**

Back in teacher context:
- open the lesson;
- verify material submissions monitor shows the student's answer;
- cancel the lesson from schedule;
- verify student context no longer gets join token / lesson entry is blocked or visibly cancelled according to current UI behavior;
- capture screenshot `artifacts/smoke/teacher-monitor-cancelled.png`.

- [ ] **Step 4: Mobile viewport**

Repeat student lesson material read at mobile viewport `390x844`:
- schedule page renders without overlap;
- lesson material panel renders;
- no console errors;
- capture screenshot `artifacts/smoke/student-mobile-material.png`.

---

## Task 6: Final Verification Gate

**Files:**
- No code changes unless previous tasks created scripts/docs.

- [ ] **Step 1: Run backend tests**

```bash
cd backend
gradle :api-gateway:test --no-daemon --stacktrace --max-workers=1
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Run OpenAPI export**

```bash
cd backend
gradle :api-gateway:exportOpenApi --no-daemon --stacktrace --max-workers=1
```

Expected: `BUILD SUCCESSFUL` and no unexpected contract diff.

- [ ] **Step 3: Run architecture searches**

```bash
rg -n "dataRepo\\.sql|LegacyJdbcDataRepo|JdbcClient|jdbcClient\\.sql" backend/api-gateway/src/main/kotlin backend/api-gateway/src/test/kotlin
rg -n "@Query" backend/api-gateway/src/main/kotlin/com/playsay/gateway --glob '*.kt'
```

Expected:
- first command returns no `JdbcClient`/legacy SQL usage;
- second command only reports `backend/api-gateway/src/main/kotlin/com/playsay/gateway/repo/DataRepo.kt`.

- [ ] **Step 4: Run frontend build if stand/browser flow changed frontend code**

```bash
npm --workspace web-app run generate
npm --workspace web-app run build
```

Expected: both commands pass. Skip only if no frontend files/scripts were changed.

- [ ] **Step 5: Execute stand smoke**

Use the API smoke and Playwright smoke sections after deploying the branch to dev. Attach:
- API smoke command output summary;
- teacher screenshot;
- student screenshot;
- monitor/cancel screenshot;
- list of any console errors.

Expected:
- no unexpected 5xx;
- no browser console errors from classroom/material pages;
- role and visibility rules match local tests.

---

## Commit Plan

1. Commit repo coverage test:
   `test(api-gateway): cover data repo query methods`
2. Commit controller test tightening:
   `test(api-gateway): tighten persistence behavior regressions`
3. Commit docs/script smoke plan:
   `docs: add data repo smoke coverage plan`

Keep commits separate so a failed stand smoke script/doc change does not block the local backend regression coverage.

---

## Acceptance Criteria

- Every method in `DataRepo.kt` has explicit local test coverage.
- Role-sensitive and visibility-sensitive queries have controller/API behavior coverage.
- Stage smoke covers teacher login, student login, lesson assignment, student lesson entry, material submission, teacher monitor, cancellation and material/course linkage.
- `JdbcClient` remains absent from production and test code.
- `LegacyJdbcDataRepo` and `dataRepo.sql(...)` remain absent.
- `@Query` remains isolated in `repo/DataRepo.kt`.
- Backend tests and OpenAPI export pass before PR/deploy report.
