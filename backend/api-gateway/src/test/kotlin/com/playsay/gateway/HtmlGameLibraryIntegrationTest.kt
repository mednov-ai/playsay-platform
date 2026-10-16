package com.playsay.gateway

import com.playsay.gateway.controller.HtmlGameLibraryController
import com.playsay.gateway.dto.HtmlGameEditRequest
import com.playsay.gateway.dto.HtmlGameForkRequest
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.MaterialGameAttachRequest
import com.playsay.gateway.error.ProjectResponseException
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional

class HtmlGameLibraryIntegrationTest : MaterialControllerTestFixture() {
    @Autowired private lateinit var lessonGames: com.playsay.gateway.controller.LessonGameController
    @Autowired private lateinit var games: HtmlGameLibraryController

    @Test
    fun `shared catalog rejects student browsing and preserves immutable upload command identity`() {
        val author = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val other = authentication(subject = "teacher-2", username = "teacher.two", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val command = UUID.randomUUID()
        val game = games.upload(author, htmlFile(), command).body!!
        assertEquals(game.id, games.upload(author, htmlFile(), command).body!!.id)
        assertFalse(games.get(other, game.id, null).canEdit)
        assertTrue(games.list(other, "", "", null, null, 0, 24).items.any { it.id == game.id })
        assertEquals(HttpStatus.FORBIDDEN, assertFailsWith<ProjectResponseException> { games.list(student, "", "", null, null, 0, 24) }.statusCode)
        assertEquals(HttpStatus.NOT_FOUND, assertFailsWith<ProjectResponseException> { games.content(student, game.id, game.revisionId, null) }.statusCode)
        assertEquals(HttpStatus.CONFLICT, assertFailsWith<ProjectResponseException> { games.upload(author, htmlFile(content = "<html><body><button>Changed</button></body></html>"), command) }.statusCode)
    }

    @Test
    fun `fork gives independent edit ownership and replacements leave old revision bytes intact`() {
        val author = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val other = authentication(subject = "teacher-2", username = "teacher.two", role = "ROLE_TEACHER")
        val original = games.upload(author, htmlFile(), UUID.randomUUID()).body!!
        val bytes = games.content(author, original.id, original.revisionId, null).body!!
        assertEquals(HttpStatus.FORBIDDEN, assertFailsWith<ProjectResponseException> { games.edit(other, original.id, HtmlGameEditRequest("Changed", expectedVersion = original.version)) }.statusCode)
        val command = HtmlGameForkRequest(original.revisionId, UUID.randomUUID())
        val fork = games.fork(other, original.id, command)
        assertEquals(fork.id, games.fork(other, original.id, command).id)
        assertTrue(fork.id != original.id && fork.canEdit)
        val replacement = games.revision(author, original.id, htmlFile(content = "<html><head><title>New game</title></head><body><button>Go</button></body></html>"), UUID.randomUUID(), original.version).body!!
        assertTrue(replacement.revisionId != original.revisionId)
        assertEquals(HttpStatus.CONFLICT, assertFailsWith<ProjectResponseException> { games.revision(author, original.id, htmlFile(), UUID.randomUUID(), original.version) }.statusCode)
        assertTrue(bytes.contentEquals(games.content(author, original.id, original.revisionId, null).body!!))
        assertTrue(bytes.contentEquals(games.content(other, fork.id, fork.revisionId, null).body!!))
    }

    @Test
    fun `attach is idempotent concurrency guarded and archive retains existing references`() {
        val author = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val game = games.upload(author, htmlFile(), UUID.randomUUID()).body!!
        val creation = com.playsay.gateway.dto.HtmlGameMaterialRequest(game.revisionId, UUID.randomUUID())
        val created = games.createMaterial(author, game.id, creation)
        assertEquals(created.id, games.createMaterial(author, game.id, creation).id)
        val material = materialCrudController.create(author, LessonMaterialRequest(title = "Game lesson")).body!!
        val page = material.document.path("pages").first().path("id").asText()
        val request = MaterialGameAttachRequest(game.id, game.revisionId, "attached-game", page, material.updatedAt)
        val attached = games.attach(author, material.id, request)
        assertEquals(attached.document, games.attach(author, material.id, request).document)
        assertEquals(1, attached.document.path("pages").flatMap { it.path("blocks").toList() }.count { it.path("id").asText() == "attached-game" })
        assertEquals(HttpStatus.CONFLICT, assertFailsWith<ProjectResponseException> { games.attach(author, material.id, request.copy(blockId = "second")) }.statusCode)
        games.archive(author, game.id)
        assertTrue(games.content(author, game.id, game.revisionId, material.id).body!!.isNotEmpty())
        val latest = materialCrudController.get(author, material.id)
        assertEquals(HttpStatus.CONFLICT, assertFailsWith<ProjectResponseException> { games.attach(author, material.id, request.copy(blockId = "new", expectedUpdatedAt = latest.updatedAt)) }.statusCode)
        materialCrudController.archive(author, material.id)
        assertEquals("ARCHIVED", games.get(author, game.id, game.revisionId).status)
    }

    @Test
    fun `direct shared launch needs no material and late stop cannot terminate a newer launch`() {
        val author = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val unrelated = authentication(subject = "teacher-2", username = "teacher.two", role = "ROLE_TEACHER")
        val game = games.upload(author, htmlFile(), UUID.randomUUID()).body!!
        val scheduled = scheduleController.create(author, com.playsay.gateway.dto.ScheduledLessonRequest(scheduledStart = activeLessonStart(), scheduledEnd = activeLessonEnd(), participantSubjects = listOf("student-1"))).body!!
        val row = lessonRepo.findById(scheduled.id).orElseThrow()
        row.status = "IN_PROGRESS"; lessonRepo.saveAndFlush(row)
        val command = com.playsay.gateway.dto.LessonGameStartRequest(game.id, game.revisionId, UUID.randomUUID())
        jdbc.update("INSERT INTO lesson_presentation(lesson_id,kind,revision) VALUES(?,'WHITEBOARD',1)", scheduled.id)
        val first = lessonGames.start(author, scheduled.id, command)
        assertEquals(first.id, lessonGames.start(author, scheduled.id, command).id)
        assertEquals(null, scheduleController.get(author, scheduled.id).materialId)
        assertEquals(first.id, lessonGames.current(student, scheduled.id).launch?.id)
        assertEquals(null, lessonGames.document(student, scheduled.id, first.id).materialId)
        assertTrue(lessonGames.content(student, scheduled.id, first.id).body!!.isNotEmpty())
        assertEquals(HttpStatus.FORBIDDEN, assertFailsWith<ProjectResponseException> { lessonGames.start(student, scheduled.id, command.copy(commandId = UUID.randomUUID())) }.statusCode)
        assertFailsWith<ProjectResponseException> { lessonGames.current(unrelated, scheduled.id) }
        val second = lessonGames.start(author, scheduled.id, command.copy(commandId = UUID.randomUUID()))
        lessonGames.stop(student, scheduled.id, first.id)
        assertEquals(second.id, lessonGames.current(student, scheduled.id).launch?.id)
        assertFailsWith<ProjectResponseException> { lessonGames.content(student, scheduled.id, first.id) }
        lessonGames.stop(student, scheduled.id, second.id)
        assertEquals(null, lessonGames.current(author, scheduled.id).launch)
        assertEquals("WHITEBOARD", lessonGames.current(author, scheduled.id).primaryKind)
        assertFailsWith<ProjectResponseException> { lessonGames.document(student, scheduled.id, second.id) }
    }

    @Test
    fun `existing upload route registers independent game with alias without changing block document`() {
        val author = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val material = materialCrudController.create(author, LessonMaterialRequest(title = "Legacy upload")).body!!
        val asset = materialAssetController.uploadHtmlGameAsset(author, material.id, htmlFile()).body!!
        assertEquals(material.document, materialCrudController.get(author, material.id).document)
        val library = games.list(author, "", "", null, null, 0, 100)
        assertTrue(library.items.isNotEmpty())
        val connection = dataSource.connection
        connection.use { con -> con.prepareStatement("SELECT game_id,revision_id FROM html_game_legacy_alias WHERE asset_id=?").use { statement ->
            statement.setObject(1, asset.id)
            statement.executeQuery().use { row ->
                assertTrue(row.next())
                val id = row.getObject(1, UUID::class.java)
                val revision = row.getObject(2, UUID::class.java)
                materialAssetRepo.deleteById(asset.id)
                materialAssetRepo.flush()
                assertTrue(games.content(author, id, revision, null).body!!.isNotEmpty())
            }
        } }
    }
    @Autowired private lateinit var jdbc: org.springframework.jdbc.core.JdbcTemplate
    @Autowired private lateinit var protocol: com.playsay.gateway.service.game.GameProtocolCompatibilityService

    @Test
    fun `catalog filters the entire set and keeps shared bytes after creator deletion`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val prefix = "Search-${UUID.randomUUID()}"
        val one = games.upload(teacher, htmlFile(), UUID.randomUUID()).body!!
        val two = games.upload(teacher, htmlFile(), UUID.randomUUID()).body!!
        games.edit(teacher, one.id, HtmlGameEditRequest("$prefix one", "food", "A1", one.version))
        games.edit(teacher, two.id, HtmlGameEditRequest("$prefix two", "travel", "B1", two.version))
        assertEquals(2, games.list(teacher, prefix, "", null, null, 0, 1).total)
        assertEquals(1, games.list(teacher, prefix, "", null, null, 1, 1).items.size)
        assertEquals(two.id, games.list(teacher, prefix, "travel", "B1", null, 0, 24).items.single().id)
        val creator = jdbc.queryForObject("SELECT creator_user_id FROM html_game WHERE id=?", UUID::class.java, one.id)
        jdbc.update("DELETE FROM app_user WHERE id=?", creator)
        assertEquals(null, jdbc.queryForObject("SELECT creator_user_id FROM html_game WHERE id=?", UUID::class.java, one.id))
        val admin = authentication(subject = "admin-new", role = "ROLE_ADMIN")
        assertTrue(games.get(admin, one.id, one.revisionId).canEdit)
        assertTrue(games.content(admin, one.id, one.revisionId, null).body!!.isNotEmpty())
    }

    @Test
    fun `legacy material upload response loss reuses asset and game`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Upload retry")).body!!
        val command = UUID.randomUUID()
        val first = materialAssetController.uploadHtmlGameAsset(teacher, material.id, htmlFile(), command).body!!
        val retry = materialAssetController.uploadHtmlGameAsset(teacher, material.id, htmlFile(), command).body!!
        assertEquals(first.id, retry.id)
        assertTrue(first.metadata.path("gameId").asText().isNotBlank())
        assertEquals(first.metadata.path("gameRevisionId"), retry.metadata.path("gameRevisionId"))
        assertEquals(1L, jdbc.queryForObject("SELECT COUNT(*) FROM html_game_legacy_alias WHERE asset_id=?", Long::class.java, first.id))
        assertFailsWith<ProjectResponseException> { materialAssetController.uploadHtmlGameAsset(teacher, material.id, htmlFile(content = "<html><body>Different</body></html>"), command) }
    }

    @Test
    fun `live upload command retries reuse lesson material page asset and catalog entry`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val lesson = scheduleController.create(teacher, com.playsay.gateway.dto.ScheduledLessonRequest(scheduledStart = activeLessonStart(), scheduledEnd = activeLessonEnd(), participantSubjects = listOf("student-1"))).body!!
        val row = lessonRepo.findById(lesson.id).orElseThrow(); row.status = "IN_PROGRESS"; lessonRepo.saveAndFlush(row)
        val command = UUID.randomUUID()
        val first = materialImagePageController.appendLiveLessonHtmlGamePage(teacher, lesson.id, htmlFile(), command).body!!
        val retry = materialImagePageController.appendLiveLessonHtmlGamePage(teacher, lesson.id, htmlFile(), command).body!!
        assertEquals(first.material.id, retry.material.id)
        assertEquals(first.activePageId, retry.activePageId)
        assertEquals(1, retry.material.document.path("pages").size())
        assertEquals(1L, jdbc.queryForObject("SELECT COUNT(*) FROM html_game_legacy_alias WHERE source_material_id=?", Long::class.java, first.material.id))
    }

    @Test
    fun `mixed clients and unsupported lesson modes fail without creating presentation state`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val game = games.upload(teacher, htmlFile(), UUID.randomUUID()).body!!
        val scheduled = scheduleController.create(teacher, com.playsay.gateway.dto.ScheduledLessonRequest(scheduledStart = activeLessonStart(), scheduledEnd = activeLessonEnd(), participantSubjects = listOf("student-1"))).body!!
        val row = lessonRepo.findById(scheduled.id).orElseThrow(); row.status = "IN_PROGRESS"; lessonRepo.saveAndFlush(row)
        val command = com.playsay.gateway.dto.LessonGameStartRequest(game.id, game.revisionId, UUID.randomUUID())
        protocol.subscribe("synthetic-old", scheduled.id, null)
        assertEquals("GAME_CLIENT_UPDATE_REQUIRED", assertFailsWith<ProjectResponseException> { lessonGames.start(teacher, scheduled.id, command) }.errorCode)
        protocol.unregister("synthetic-old")
        row.workMode = "PARALLEL"; lessonRepo.saveAndFlush(row)
        assertFailsWith<ProjectResponseException> { lessonGames.start(teacher, scheduled.id, command) }
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM lesson_game_launch WHERE lesson_id=?", Long::class.java, scheduled.id))
    }

    @Autowired private lateinit var objects: com.playsay.gateway.service.MaterialObjectStorage

    @Test
    fun `game cover survives removal of its original material object`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Cover retention")).body!!
        val asset = materialAssetController.uploadHtmlGameAsset(teacher, material.id, htmlFile()).body!!
        materialCrudController.update(teacher, material.id, LessonMaterialRequest(title = "Cover retention", document = objectMapper.readTree("""{"schemaVersion":1,"pages":[{"id":"page","blocks":[{"id":"game","type":"htmlGame","url":"material-asset:${asset.id}"}]}]}""")))
        materialAssetController.requestHtmlGameEnrichment(teacher, material.id, asset.id, com.playsay.gateway.dto.MaterialHtmlGameEnrichmentRequest(blockId = "game"))
        materialHtmlGameEnrichmentService.process(kotlin.test.assertNotNull(materialHtmlGameEnrichmentService.claimNext()))
        val cover = materialAssetRepo.findByMaterialIdOrderByCreatedAtDesc(material.id).single { it.kind == "GAME_ICON" }
        val original = objects.getObject(cover.storageKey!!).bytes
        objects.deleteObject(cover.storageKey!!)
        val alias = jdbc.queryForMap("SELECT game_id,revision_id FROM html_game_legacy_alias WHERE asset_id=?", asset.id)
        val gameId = alias["game_id"] as UUID; val revisionId = alias["revision_id"] as UUID
        assertTrue(games.get(teacher, gameId, revisionId).hasCover)
        assertTrue(original.contentEquals(games.cover(teacher, gameId, revisionId, null).body!!))
    }

}
