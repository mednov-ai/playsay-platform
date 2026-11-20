package com.playsay.gateway

import com.playsay.gateway.dto.CourseRequest
import com.playsay.gateway.dto.CourseLessonRequest
import com.playsay.gateway.dto.ScheduledLessonMaterialAssignmentRequest
import com.playsay.gateway.repo.LessonMaterialParallelAnnotationRepo
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.MaterialAnnotationRequest
import com.playsay.gateway.dto.MaterialLibraryQuery
import com.playsay.gateway.dto.ScheduledLessonRequest
import com.playsay.gateway.service.MaterialLibraryIndexService
import com.playsay.gateway.service.ScheduledLessonMaterialAssignmentService
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException

@EnabledIfEnvironmentVariable(named = "CLASSROOM_TEST_POSTGRES_URL", matches = ".+")
class ClassroomMaterialPostgresTest : MaterialControllerTestFixture() {
    @Autowired lateinit var txManager: PlatformTransactionManager
    @Autowired lateinit var assignments: ScheduledLessonMaterialAssignmentService
    @Autowired lateinit var boards: com.playsay.gateway.service.LessonWhiteboardService
    @Autowired lateinit var library: MaterialLibraryIndexService

    @Autowired lateinit var parallelAnnotations: LessonMaterialParallelAnnotationRepo

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = ["explicit", "inherited", "participant"])
    fun `reassignment and annotation save serialize in either order`(mode: String) {
        val teacher = authentication("teacher-1", role = "ROLE_TEACHER")
        val student = authentication("student-1", role = "ROLE_STUDENT")
        val a = materialCrudController.create(teacher, LessonMaterialRequest(title = "A", status = "PUBLISHED")).body!!
        val b = materialCrudController.create(teacher, LessonMaterialRequest(title = "B", status = "PUBLISHED")).body!!
        val course = courseController.create(teacher, CourseRequest(title = "Course", isPublished = true)).body!!
        val template = courseController.createLesson(teacher, course.id, CourseLessonRequest(title = "Template", materialId = a.id)).body!!
        val lesson = scheduleController.create(teacher, ScheduledLessonRequest(
            lessonTemplateId = if (mode == "inherited") template.id else null,
            materialId = if (mode == "explicit") a.id else null, inheritTemplateMaterial = mode == "inherited",
            workMode = if (mode == "participant") "PARALLEL" else "SHARED",
            scheduledStart = activeLessonStart(), scheduledEnd = activeLessonEnd(), type = "GROUP",
            participantSubjects = listOf("student-1", "student-2"),
            participantAssignments = if (mode == "participant") listOf(
                ScheduledLessonMaterialAssignmentRequest(a.id, listOf("student-1")),
                ScheduledLessonMaterialAssignmentRequest(b.id, listOf("student-2")),
            ) else emptyList(),
        )).body!!
        val learner = appUserRepo.findByKeycloakSubject("student-1")!!.id
        fun assign(id: UUID) {
            when (mode) {
                "inherited" -> courseController.updateLesson(teacher, course.id, template.id, CourseLessonRequest(title = "Template", materialId = id))
                "participant" -> assignments.assignParticipant(teacher, lesson.id, "student-1", id)
                else -> assignments.assignShared(teacher, lesson.id, id)
            }
        }
        fun stored(id: UUID) = if (mode == "participant")
            parallelAnnotations.findByLessonIdAndMaterialIdAndStudentUserId(lesson.id, id, learner)?.content
            else lessonMaterialAnnotationRepo.findByLessonIdAndMaterialId(lesson.id, id)?.content
        val initial = MaterialAnnotationRequest(objectMapper.readTree("""{"strokes":[{"id":"first"}]}"""), a.id)
        fun save(body: MaterialAnnotationRequest) = scheduledMaterialController.saveScheduledLessonMaterialAnnotation(student, lesson.id, body)
        fun race(first: () -> Unit, second: () -> Unit) {
            val ready = CountDownLatch(1)
            val executor = Executors.newSingleThreadExecutor()
            try {
                lateinit var waiting: java.util.concurrent.Future<*>
                TransactionTemplate(txManager).executeWithoutResult {
                    first()
                    waiting = executor.submit { ready.countDown(); second() }
                    assertTrue(ready.await(10, TimeUnit.SECONDS))
                    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
                    val sql = "select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'"
                    val jdbc = JdbcTemplate(dataSource)
                    while ((jdbc.queryForObject(sql, Int::class.java) ?: 0) == 0) {
                        check(System.nanoTime() < deadline) { "The concurrent request never waited for a database lock" }
                        jdbc.execute("select pg_stat_clear_snapshot()")
                        Thread.sleep(10)
                    }
                }
                waiting.get(15, TimeUnit.SECONDS)
            } finally { executor.shutdownNow() }
        }
        race({ save(initial) }, { assign(b.id) })
        assertEquals(initial.content, objectMapper.readTree(stored(a.id)!!))
        assign(a.id)
        race({ assign(b.id) }, {
            val error = assertFailsWith<ResponseStatusException> { save(initial.copy(content = objectMapper.readTree("""{"strokes":[]}"""))) }
            assertEquals(HttpStatus.CONFLICT, error.statusCode)
        })
        assertEquals(null, stored(b.id))
        assertEquals(initial.content, objectMapper.readTree(stored(a.id)!!))
    }

    @Test
    fun `database pages retain literal filters and an exact total as the catalog grows`() {
        val teacher = authentication("teacher-1", role = "ROLE_TEACHER")
        val student = authentication("student-1", role = "ROLE_STUDENT")
        fun add(index: Int) {
            val at = java.time.Instant.now()
            val lesson = lessonRepo.saveAndFlush(com.playsay.gateway.entity.LessonEntity(
                teacherUserId = appUserRepo.findByKeycloakSubject("teacher-1")!!.id,
                scheduledStart = activeLessonStart(), scheduledEnd = activeLessonEnd(), actualStart = at,
                status = "IN_PROGRESS", type = "INDIVIDUAL", createdAt = at, updatedAt = at,
            ))
            val learner = appUserRepo.findByKeycloakSubject(if (index % 2 == 0) "student-1" else "student-2")!!.id
            lessonParticipantRepo.saveAndFlush(com.playsay.gateway.entity.LessonParticipantEntity(lessonId = lesson.id, studentUserId = learner))
            boards.ensure(teacher, lesson.id, null)
            materialCrudController.create(teacher, LessonMaterialRequest(title = "СЛОВО %_$index", topicTags = listOf("Birds"),
                visibility = if (index % 2 == 0) "PUBLIC" else "PRIVATE", status = "PUBLISHED"))
        }
        val query = MaterialLibraryQuery(category = "ALL", kind = "MATERIAL", query = "слово %_", topic = "IRD", limit = 3)
        fun verify(size: Int) {
            val jdbc = JdbcTemplate(dataSource)
            // The dedicated fixture enables pg_stat_statements to count the entire endpoint read path.
            fun selectCount() = jdbc.queryForObject("""select coalesce(sum(calls), 0) from pg_stat_statements
                where dbid = (select oid from pg_database where datname = current_database())
                and lower(query) like 'select %' and query not ilike '%pg_stat_statements%'""", Long::class.java)!!
            for (limit in listOf(1, 3, 200)) {
                val before = selectCount()
                val mixed = library.list(student, MaterialLibraryQuery(category = "ALL", limit = limit))
                assertEquals(size, mixed.total)
                assertEquals(3L, selectCount() - before, "actor, exact count and narrow page at size=$size limit=$limit")
            }
            val page = library.list(student, query)
            assertEquals(size / 2, page.total)
            assertEquals(3, page.items.size)
            val all = library.list(teacher, query.copy(limit = 200))
            assertEquals(size, all.total)
            assertEquals(size, all.items.map { it.id }.toSet().size)
            val empty = library.list(student, query.copy(offset = size))
            assertTrue(empty.items.isEmpty())
            assertEquals(page.total, empty.total)
        }
        (1..10).forEach(::add)
        verify(10)
        (11..100).forEach(::add)
        verify(100)
    }

    @Test
    fun `tied rows retain Java UUID order across both sign bits`() {
        val teacher = authentication("teacher-1", role = "ROLE_TEACHER")
        val jdbc = JdbcTemplate(dataSource)
        val ids = listOf("00000000-0000-0000-0000-000000000001", "80000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-8000-000000000001", "80000000-0000-0000-8000-000000000001").map(UUID::fromString)
        for (id in ids) {
            val row = materialCrudController.create(teacher, LessonMaterialRequest(title = "Tied")).body!!
            jdbc.update("update lesson_material set id = ?, updated_at = timestamp '2020-01-01 00:00:00' where id = ?", id, row.id)
        }
        val query = MaterialLibraryQuery(category = "ALL", query = "Tied", limit = 1)
        assertEquals(ids.sorted(), ids.indices.map { library.list(teacher, query.copy(offset = it)).items.single().id })
        for (bad in listOf(query.copy(category = "UNKNOWN"), query.copy(kind = "OTHER"), query.copy(limit = 201), query.copy(offset = -1))) {
            assertEquals(HttpStatus.BAD_REQUEST, assertFailsWith<ResponseStatusException> { library.list(teacher, bad) }.statusCode)
        }
    }

    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    lateinit var namedJdbc: org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate

    @Test
    fun `page and count see the same snapshot during an independent committed insert`() {
        val teacher = authentication("teacher-1", role = "ROLE_TEACHER")
        val student = authentication("student-1", role = "ROLE_STUDENT")
        fun add(title: String) = materialCrudController.create(teacher, LessonMaterialRequest(title = title, visibility = "PUBLIC", status = "PUBLISHED"))
        val original = add("Snapshot original").body!!.id
        val executor = Executors.newSingleThreadExecutor()
        try {
            org.mockito.Mockito.doAnswer { call ->
                val total = call.callRealMethod()
                executor.submit { add("Snapshot concurrent") }.get(10, TimeUnit.SECONDS)
                total
            }.`when`(namedJdbc).queryForObject(org.mockito.Mockito.startsWith("select count(*)"),
                org.mockito.Mockito.anyMap<String, Any>(), org.mockito.Mockito.eq(Int::class.java))
            val page = library.list(student, MaterialLibraryQuery(category = "ALL", kind = "MATERIAL", query = "Snapshot", limit = 10))
            assertEquals(1, page.total)
            assertEquals(listOf(original), page.items.map { it.id })
        } finally { executor.shutdownNow(); org.mockito.Mockito.reset(namedJdbc) }
        assertEquals(2, library.list(student, MaterialLibraryQuery(category = "ALL", query = "Snapshot")).total)
    }

    companion object {
        @JvmStatic @DynamicPropertySource
        fun postgres(registry: DynamicPropertyRegistry) {
            val url = requireNotNull(System.getenv("CLASSROOM_TEST_POSTGRES_URL"))
            require(Regex("""jdbc:postgresql://(localhost|127\.0\.0\.1):\d+/honey_hardening_test""").matches(url)) {
                "Requires a dedicated local fixture database named honey_hardening_test"
            }
            registry.add("playsay.whiteboard.enabled") { true }
            registry.add("spring.datasource.url") { url }
            registry.add("spring.datasource.username") { System.getenv("CLASSROOM_TEST_POSTGRES_USER") }
            registry.add("spring.datasource.password") { System.getenv("CLASSROOM_TEST_POSTGRES_PASSWORD") }
            registry.add("spring.datasource.driver-class-name") { "org.postgresql.Driver" }
        }
    }
}
