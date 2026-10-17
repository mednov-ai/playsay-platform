package com.playsay.gateway

import com.playsay.gateway.dto.MaterialLibraryQuery
import com.playsay.gateway.dto.UpdateLessonWhiteboardRequest
import com.playsay.gateway.dto.WhiteboardPolicyRequest
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonParticipantEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.CollaborationDocumentRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.service.LessonWhiteboardService
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.*
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

@SpringBootTest(properties = [
    "spring.datasource.url=jdbc:h2:mem:whiteboard-tests;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.liquibase.enabled=false", "playsay.whiteboard.enabled=true",
    "playsay.collaboration.token-secret=whiteboard-local-test-signing-secret-at-least-32",
    "playsay.collaboration.service-token=whiteboard-test-service-secret-at-least-32-bytes",
])
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LessonWhiteboardServiceTest @Autowired constructor(
    private val service: LessonWhiteboardService,
    private val users: AppUserRepo,
    private val lessons: LessonRepo,
    private val participants: LessonParticipantRepo,
    private val documents: CollaborationDocumentRepo,
    private val dataSource: DataSource,
    private val materialRepo: com.playsay.gateway.repo.LessonMaterialRepo,
    private val catalog: com.playsay.gateway.service.LessonMaterialCatalogService,
    private val index: com.playsay.gateway.service.MaterialLibraryIndexService,
    private val snapshots: com.playsay.gateway.service.CollaborationSnapshotService,
    private val collaboration: com.playsay.gateway.service.CollaborationDocumentService,
    private val mapper: com.fasterxml.jackson.databind.ObjectMapper,
    private val webContext: org.springframework.web.context.WebApplicationContext,
) {
    private val token = "whiteboard-test-service-secret-at-least-32-bytes"
    @BeforeAll fun migrate() { SpringLiquibase().apply { dataSource = this@LessonWhiteboardServiceTest.dataSource; changeLog = "classpath:db/changelog/db.changelog-master.xml" }.afterPropertiesSet() }

    @Test fun `board without material is stable and teacher controls learner drawing`() {
        val (lesson, teacher, students) = fixture()
        val board = service.ensure(teacher, lesson.id, null)
        assertNull(board.document.materialId)
        assertEquals(board.id, service.ensure(teacher, lesson.id, null).id)
        val learner = service.current(students[0], lesson.id, null).board!!
        assertFalse(learner.canDraw)
        val granted = service.update(teacher, lesson.id, board.id, UpdateLessonWhiteboardRequest(learner.controlRevision, learnerInkEnabled = true, background = "#fff8e8"))
        assertTrue(service.policy(token, board.document.id, WhiteboardPolicyRequest(students[0].token.subject, 0)).canDraw)
        service.update(teacher, lesson.id, board.id, UpdateLessonWhiteboardRequest(granted.controlRevision, learnerInkEnabled = false))
        assertFalse(service.policy(token, board.document.id, WhiteboardPolicyRequest(students[0].token.subject, 0)).canDraw)
        assertFailsWith<ProjectResponseException> { service.update(students[0], lesson.id, board.id, UpdateLessonWhiteboardRequest(0, clear = true)) }
    }

    @Test fun `clear keeps board identity and removes the old persistence target`() {
        val (lesson, teacher, _) = fixture()
        val board = service.ensure(teacher, lesson.id, null)
        val configured = service.update(teacher, lesson.id, board.id, UpdateLessonWhiteboardRequest(board.controlRevision, background = "#202433", learnerInkEnabled = true))
        val cleared = service.update(teacher, lesson.id, board.id, UpdateLessonWhiteboardRequest(configured.controlRevision, clear = true))
        assertEquals(board.id, cleared.id)
        assertEquals(1, cleared.contentEpoch)
        assertEquals("#202433", cleared.background); assertTrue(cleared.learnerInkEnabled)
        assertNotEquals(board.document.id, cleared.document.id)
        assertFalse(documents.existsById(board.document.id))
        assertFailsWith<ProjectResponseException> { service.policy(token, board.document.id, WhiteboardPolicyRequest(teacher.token.subject, 0)) }
        assertFailsWith<ProjectResponseException> { service.update(teacher, lesson.id, board.id, UpdateLessonWhiteboardRequest(board.controlRevision, clear = true)) }
    }

    @Test fun `parallel boards and history remain isolated`() {
        val (lesson, teacher, students) = fixture("PARALLEL")
        val a = service.ensure(teacher, lesson.id, students[0].token.subject)
        val b = service.ensure(teacher, lesson.id, students[1].token.subject)
        assertNotEquals(a.id, b.id)
        assertEquals(a.id, service.current(students[0], lesson.id, null).board?.id)
        assertFailsWith<ProjectResponseException> { service.get(students[0], lesson.id, b.id) }
        lesson.status = "COMPLETED"; lesson.actualEnd = Instant.now(); lessons.saveAndFlush(lesson)
        assertTrue(service.get(students[0], lesson.id, a.id).readOnly)
        assertFalse(service.get(teacher, lesson.id, a.id).canDraw)
        assertFailsWith<ProjectResponseException> { service.ensure(teacher, lesson.id, students[0].token.subject) }
        assertFailsWith<ProjectResponseException> { service.policy(token, a.document.id, WhiteboardPolicyRequest(students[0].token.subject, 0)) }
    }

    @Test fun `concurrent ensure serializes context and material replacement keeps identity`() {
        val (lesson, teacher, _) = fixture()
        val start = java.util.concurrent.CountDownLatch(1)
        val executor = java.util.concurrent.Executors.newFixedThreadPool(2)
        try {
            val calls = List(2) { executor.submit<UUID> { start.await(); service.ensure(teacher, lesson.id, null).id } }
            start.countDown()
            assertEquals(calls[0].get(15, java.util.concurrent.TimeUnit.SECONDS), calls[1].get(15, java.util.concurrent.TimeUnit.SECONDS))
            val material = catalog.create(teacher, com.playsay.gateway.dto.LessonMaterialRequest(title = "Prepared"))
            lesson.materialId = material.id; lessons.saveAndFlush(lesson)
            assertEquals(calls[0].get(), service.ensure(teacher, lesson.id, null).id)
            assertFalse(catalog.get(teacher, material.id).isLessonMaterial)
        } finally { executor.shutdownNow() }
    }

    @Test fun `foreign teachers and students cannot read or control another lesson`() {
        val (lesson, teacher, _) = fixture()
        val board = service.ensure(teacher, lesson.id, null)
        for (stranger in listOf(auth(user("TEACHER")), auth(user("STUDENT")))) {
            assertFailsWith<ProjectResponseException> { service.get(stranger, lesson.id, board.id) }
            assertFailsWith<ProjectResponseException> { service.ensure(stranger, lesson.id, null) }
            assertTrue(service.history(stranger, lesson.id).isEmpty())
            assertEquals(0, index.list(stranger, MaterialLibraryQuery(category = "LESSON", kind = "LESSON_WHITEBOARD", limit = 10)).total)
        }
    }

    @Test fun `only trusted epoch-bound snapshots drain after completion`() {
        val (lesson, teacher, students) = fixture()
        val board = service.ensure(teacher, lesson.id, null)
        val snapshot = mapper.readTree("""{"coordinateSpace":"whiteboard-world","contentEpoch":0,"encoding":"yjs-update-v1","yjsUpdateBase64":"AAA=","stateVectorBase64":"AA=="}""")
        val request = com.playsay.gateway.dto.SaveCollaborationSnapshotRequest(snapshot)
        for (actor in listOf(students[0], teacher)) assertFailsWith<ProjectResponseException> { snapshots.saveSnapshot(actor, lesson.id, board.document.id, request) }
        assertFailsWith<ProjectResponseException> { snapshots.saveSnapshotFromService("bad", lesson.id, board.document.id, request) }
        lesson.status = "COMPLETED"; lesson.actualEnd = Instant.now(); lessons.saveAndFlush(lesson)
        snapshots.saveSnapshotFromService(token, lesson.id, board.document.id, request)
        assertEquals(snapshot, service.get(students[0], lesson.id, board.id).document.snapshot)
        assertFailsWith<ProjectResponseException> { snapshots.saveSnapshotFromService(token, lesson.id, board.document.id, com.playsay.gateway.dto.SaveCollaborationSnapshotRequest(mapper.readTree("""{"contentEpoch":1,"coordinateSpace":"whiteboard-world"}"""))) }
    }

    @Test fun `category omission preserves manual choice and immutable provenance`() {
        val (lesson, teacher, _) = fixture()
        val provenance = mapper.readTree("""{"kind":"LIVE_LESSON_COPY","sourceLessonId":"${UUID.randomUUID()}"}""")
        val material = catalog.create(teacher, com.playsay.gateway.dto.LessonMaterialRequest(title = "Lesson result", isLessonMaterial = true, sourceMeta = provenance))
        lesson.materialId = material.id; lessons.saveAndFlush(lesson)
        val oldClient = com.playsay.gateway.dto.LessonMaterialRequest(title = "Old client edit")
        assertTrue(catalog.update(teacher, material.id, oldClient).isLessonMaterial)
        assertFalse(catalog.update(teacher, material.id, oldClient.copy(isLessonMaterial = false)).isLessonMaterial)
        assertFalse(catalog.update(teacher, material.id, oldClient).isLessonMaterial)
        assertEquals(provenance, catalog.get(teacher, material.id).sourceMeta)
        assertEquals(material.id, lessons.findById(lesson.id).orElseThrow().materialId)
    }

    @Test fun `library counts filter before pagination and omit board snapshots`() {
        val (lesson, teacher, _) = fixture()
        val board = service.ensure(teacher, lesson.id, null)
        repeat(4) { catalog.create(teacher, com.playsay.gateway.dto.LessonMaterialRequest(title = "Find result $it", isLessonMaterial = true)) }
        catalog.create(teacher, com.playsay.gateway.dto.LessonMaterialRequest(title = "Study only"))
        val page = index.list(teacher, MaterialLibraryQuery(category = "LESSON", offset = 2, limit = 2))
        assertEquals(5, page.total); assertEquals(2, page.items.size)
        val boardsOnly = index.list(teacher, MaterialLibraryQuery(category = "LESSON", kind = "LESSON_WHITEBOARD", limit = 10))
        assertEquals(listOf(board.id), boardsOnly.items.map { it.id })
        assertFalse(mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(boardsOnly).toString().contains("snapshot"))
        assertEquals(4, index.list(teacher, MaterialLibraryQuery(category = "ALL", query = "Find result", limit = 2)).total)
    }

    @Test fun `database rejects material-less ordinary documents and invalid board context`() {
        val (lesson, teacher, _) = fixture()
        val board = service.ensure(teacher, lesson.id, null)
        val jdbc = org.springframework.jdbc.core.JdbcTemplate(dataSource)
        assertFails { jdbc.update("UPDATE collaboration_document SET document_kind = 'MATERIAL_WORK' WHERE id = ?", board.document.id) }
        assertFails { jdbc.update("UPDATE lesson_whiteboard SET context_key = 'wrong' WHERE id = ?", board.id) }
        assertEquals("LESSON_WHITEBOARD", documents.findById(board.document.id).orElseThrow().documentKind)
    }

    @Test fun `kick and persisted role revocation invalidate current context and old-token control`() {
        val (lesson, teacher, students) = fixture()
        val board = service.ensure(teacher, lesson.id, null)
        assertTrue(service.get(auth(user("ADMIN")), lesson.id, board.id).canManage)
        org.springframework.jdbc.core.JdbcTemplate(dataSource).update("INSERT INTO lesson_admission (id, lesson_id, subject, status, revision, created_at, updated_at, row_version) VALUES (?, ?, ?, 'KICKED', 1, ?, ?, 0)", UUID.randomUUID(), lesson.id, students[0].token.subject, Instant.now(), Instant.now())
        assertFailsWith<ProjectResponseException> { service.current(students[0], lesson.id, null) }
        assertFailsWith<ProjectResponseException> { service.policy(token, board.document.id, WhiteboardPolicyRequest(students[0].token.subject, 0)) }
        val actor = users.findByKeycloakSubject(teacher.token.subject)!!; actor.roles = "STUDENT"; users.saveAndFlush(actor)
        assertFailsWith<ProjectResponseException> { service.update(teacher, lesson.id, board.id, UpdateLessonWhiteboardRequest(board.controlRevision, learnerInkEnabled = true)) }
        assertFailsWith<ProjectResponseException> { service.policy(token, board.document.id, WhiteboardPolicyRequest(teacher.token.subject, 0)) }
    }

    @Test fun `HTTP context commands and indexed query defaults bind as the published contract`() {
        val (lesson, teacher, students) = fixture()
        val mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup(webContext).build()
        val contextPath = "/schedule/lessons/${lesson.id}/whiteboard"
        val opened = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(contextPath).principal(teacher)).andReturn().response
        assertEquals(200, opened.status); assertTrue(opened.contentType!!.startsWith("application/json"))
        val id = mapper.readTree(opened.contentAsString).path("id").asText()
        val study = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/library/items").principal(teacher)).andReturn().response
        assertEquals(200, study.status); assertEquals(0, mapper.readTree(study.contentAsString).path("total").asInt())
        val results = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/library/items").param("category", "LESSON").param("limit", "1").principal(teacher)).andReturn().response
        assertEquals(200, results.status); assertEquals(id, mapper.readTree(results.contentAsString).path("items").path(0).path("id").asText())
        val forbidden = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/schedule/lessons/${lesson.id}/whiteboards/$id").contentType("application/json").content("""{"expectedRevision":1,"clear":true}""").principal(students[0])).andReturn().response
        assertEquals(403, forbidden.status)
    }

    @Test fun `real board credentials bind identity epoch scope and routing without material capabilities`() {
        val (lesson, teacher, students) = fixture()
        val board = service.ensure(teacher, lesson.id, null)
        val issued = collaboration.token(students[0], lesson.id, board.document.id)
        val jwt = com.nimbusds.jwt.SignedJWT.parse(issued.token)
        assertTrue(jwt.verify(com.nimbusds.jose.crypto.MACVerifier("whiteboard-local-test-signing-secret-at-least-32")))
        val claims = jwt.jwtClaimsSet
        assertEquals("playsay-api-gateway", claims.issuer); assertEquals(students[0].token.subject, claims.subject)
        assertEquals(board.id.toString(), claims.getStringClaim("whiteboardId")); assertEquals(0L, claims.getLongClaim("contentEpoch"))
        assertNull(claims.getClaim("materialId")); assertEquals(false, claims.getBooleanClaim("canPublishMaterialViewport"))
        assertEquals("GROUP", claims.getStringClaim("scope")); assertEquals(board.document.yjsDocumentId, issued.yjsDocumentId)
        assertTrue(issued.websocketUrl.endsWith("/collab/ws"))
        lesson.status = "COMPLETED"; lesson.actualEnd = Instant.now(); lessons.saveAndFlush(lesson)
        assertFailsWith<ProjectResponseException> { collaboration.token(students[0], lesson.id, board.document.id) }
    }

    private fun fixture(mode: String = "SHARED"): Triple<LessonEntity, JwtAuthenticationToken, List<JwtAuthenticationToken>> {
        val teacher = user("TEACHER")
        val students = List(2) { user("STUDENT") }
        val now = Instant.now()
        val lesson = lessons.saveAndFlush(LessonEntity(teacherUserId = teacher.id, status = "IN_PROGRESS", type = "INDIVIDUAL", workMode = mode,
            scheduledStart = now.minusSeconds(60), scheduledEnd = now.plusSeconds(3600), actualStart = now, createdAt = now, updatedAt = now))
        students.forEach { participants.saveAndFlush(LessonParticipantEntity(lessonId = lesson.id, studentUserId = it.id)) }
        return Triple(lesson, auth(teacher), students.map(::auth))
    }
    private fun user(role: String): AppUserEntity = users.saveAndFlush(AppUserEntity(keycloakSubject = UUID.randomUUID().toString(), roles = role, createdAt = Instant.now(), updatedAt = Instant.now()))
    private fun auth(user: AppUserEntity): JwtAuthenticationToken = JwtAuthenticationToken(Jwt.withTokenValue("test").header("alg", "none").subject(user.keycloakSubject)
        .claim("realm_access", mapOf("roles" to listOf(user.roles))).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build(),
        listOf(SimpleGrantedAuthority("ROLE_${user.roles}")))
}
