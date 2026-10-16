package com.playsay.gateway

import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.service.MaterialObjectStorage
import com.playsay.gateway.service.game.HtmlGameLibraryMigrationService
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate

class HtmlGameLibraryMigrationIntegrationTest : MaterialControllerTestFixture() {
    @Autowired private lateinit var migration: HtmlGameLibraryMigrationService
    @Autowired private lateinit var objects: MaterialObjectStorage
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean private lateinit var jdbc: JdbcTemplate

    @Test
    fun `drain rejects accessible lessons including extensions but leaves expired history untouched`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val scheduled = scheduleController.create(teacher, com.playsay.gateway.dto.ScheduledLessonRequest(scheduledStart = activeLessonStart(), scheduledEnd = activeLessonEnd(), participantSubjects = listOf("student-1"))).body!!
        val row = lessonRepo.findById(scheduled.id).orElseThrow()
        row.status = "IN_PROGRESS"
        lessonRepo.saveAndFlush(row)
        kotlin.test.assertFailsWith<com.playsay.gateway.error.ProjectResponseException> { migration.requireDrained() }
        row.scheduledEnd = Instant.now().minusSeconds(1200)
        row.accessExtensionSeconds = 900
        lessonRepo.saveAndFlush(row)
        kotlin.test.assertFailsWith<com.playsay.gateway.error.ProjectResponseException> { migration.requireDrained() }
        row.accessExtensionSeconds = 0
        lessonRepo.saveAndFlush(row)
        migration.requireDrained()
        assertEquals("IN_PROGRESS", lessonRepo.findById(row.id).orElseThrow().status)
        assertEquals(0, lessonRepo.findById(row.id).orElseThrow().accessExtensionSeconds)
    }

    @Test
    fun `dry run and repeated migration preserve bytes IDs provenance and merge only verified copies`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Legacy", visibility = "PRIVATE")).body!!
        val bytes = "<html><head><title>Legacy race</title></head><body><button>Go</button></body></html>".toByteArray()
        val source = legacy(material.id, bytes)
        val copyMaterial = materialCrudController.create(teacher, LessonMaterialRequest(title = "Lesson copy")).body!!
        val copy = legacy(copyMaterial.id, bytes, source)
        fun link(materialId: UUID, assetId: UUID) {
            materialCrudController.update(teacher, materialId, LessonMaterialRequest(title = "Legacy", document = objectMapper.readTree("""{"schemaVersion":1,"pages":[{"id":"page-original","title":"Original","layout":"FLOW","blocks":[{"id":"block-original","type":"htmlGame","title":"Keep title","url":"material-asset:$assetId","prompt":"Keep instructions"}]}]}"""), sourceMeta = objectMapper.readTree("""{"kind":"LIVE_LESSON_COPY","custom":"retain"}""")))
        }
        link(material.id, source); link(copyMaterial.id, copy)
        materialCrudController.archive(teacher, material.id)
        val dry = migration.batch(true)
        assertEquals(2, dry.outcomes.count { it.outcome == "READY" })
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM html_game_legacy_alias WHERE asset_id IN (?,?)", Long::class.java, source, copy))
        val done = migration.batch(false)
        assertEquals(0, done.outcomes.count { it.outcome == "BLOCKED" })
        migration.materials(false)
        val target = materialCrudController.get(teacher, material.id)
        val copied = materialCrudController.get(teacher, copyMaterial.id)
        val block = target.document.path("pages").first().path("blocks").first()
        val copiedBlock = copied.document.path("pages").first().path("blocks").first()
        assertEquals(block.path("gameId"), copiedBlock.path("gameId"))
        assertEquals(block.path("gameRevisionId"), copiedBlock.path("gameRevisionId"))
        assertEquals("block-original", block.path("id").asText())
        assertEquals("Keep title", block.path("title").asText())
        assertEquals("Keep instructions", block.path("prompt").asText())
        assertEquals("LIVE_LESSON_COPY", target.sourceMeta.path("kind").asText())
        val aliasesBefore = jdbc.queryForObject("SELECT COUNT(*) FROM html_game_legacy_alias", Long::class.java)
        migration.batch(false); migration.materials(false)
        assertEquals(aliasesBefore, jdbc.queryForObject("SELECT COUNT(*) FROM html_game_legacy_alias", Long::class.java))
        assertEquals(target.document, materialCrudController.get(teacher, material.id).document)
        assertTrue(bytes.contentEquals(materialAssetController.assetContent(teacher, material.id, source).body!!))
    }

    @Test
    fun `missing stored HTML blocks the inventory instead of disappearing`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Missing source")).body!!
        val id = UUID.randomUUID()
        materialAssetRepo.saveAndFlush(MaterialAssetEntity(id = id, materialId = material.id, kind = "HTML_GAME", provider = "UPLOADED", storageKey = "synthetic-missing-object", createdAt = Instant.now()))
        val result = migration.batch(false)
        assertEquals("BLOCKED", result.outcomes.single { it.assetId == id }.outcome)
        assertTrue(result.remaining > 0)
    }

    @Autowired private lateinit var games: com.playsay.gateway.controller.HtmlGameLibraryController
    @Autowired private lateinit var adaptationRepo: com.playsay.gateway.repo.MaterialGameAdaptationRepo

    @Test
    fun `accepted adaptation copies retain effective bytes while unreviewed candidate stays outside playable catalog`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Adaptation")).body!!
        val sourceBytes = "<html><body>Source</body></html>".toByteArray()
        val source = legacy(material.id, sourceBytes)
        val adaptedBytes = "<html><body>Accepted</body></html>".toByteArray()
        val accepted = legacy(material.id, adaptedBytes)
        val candidate = legacy(material.id, "<html><body>Candidate</body></html>".toByteArray())
        for ((assetId, status) in listOf(accepted to "ROLLED_BACK", candidate to "READY_FOR_REVIEW")) {
            val asset = materialAssetRepo.findById(assetId).orElseThrow()
            asset.metadata = objectMapper.readTree(asset.metadata).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("sourceAssetId", source.toString()).toString()
            materialAssetRepo.saveAndFlush(asset)
            adaptationRepo.saveAndFlush(com.playsay.gateway.entity.MaterialGameAdaptationEntity(materialId = material.id, sourceAssetId = source, adaptedAssetId = assetId, blockId = "game", status = status, mechanicsValidation = "PASSED", validatorVersion = "mechanics-v3", createdAt = Instant.now(), updatedAt = Instant.now()))
        }
        val copy = materialCrudController.create(teacher, LessonMaterialRequest(title = "Old lesson copy")).body!!
        val copiedAsset = legacy(copy.id, adaptedBytes, accepted)
        val dry = migration.batch(true)
        assertEquals("CANDIDATE", dry.outcomes.single { it.assetId == candidate }.outcome)
        // Stop and resume across batches, emulating a job restart after the first commit.
        var cursor: UUID? = null
        do { val batch = migration.batch(false, cursor, 1); cursor = batch.outcomes.lastOrNull()?.assetId; assertTrue(batch.outcomes.none { it.outcome == "BLOCKED" }) } while (cursor != null)
        val acceptedTarget = jdbc.queryForMap("SELECT game_id,revision_id FROM html_game_legacy_alias WHERE asset_id=?", accepted)
        val oldVariant = games.get(teacher, acceptedTarget["game_id"] as UUID, acceptedTarget["revision_id"] as UUID)
        assertEquals("REVALIDATION_REQUIRED", oldVariant.validationStatus)
        assertTrue(adaptedBytes.contentEquals(games.content(teacher, oldVariant.id, oldVariant.revisionId, null).body!!))
        val blocked = kotlin.test.assertFailsWith<com.playsay.gateway.error.ProjectResponseException> { games.attach(teacher, copy.id, com.playsay.gateway.dto.MaterialGameAttachRequest(oldVariant.id, oldVariant.revisionId, "new-attachment", copy.document.path("pages").first().path("id").asText(), copy.updatedAt)) }
        assertEquals("GAME_ADAPTATION_NOT_ACCEPTED", blocked.errorCode)
        assertEquals(acceptedTarget, jdbc.queryForMap("SELECT game_id,revision_id FROM html_game_legacy_alias WHERE asset_id=?", copiedAsset))
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM html_game_legacy_alias WHERE asset_id=?", Long::class.java, candidate))
        assertEquals("CANDIDATE", jdbc.queryForObject("SELECT outcome FROM html_game_migration_checkpoint WHERE asset_id=?", String::class.java, candidate))
        migration.materials(false)
        assertEquals(0L, migration.reconcile()["unresolved"])
        val revisions = jdbc.queryForObject("SELECT COUNT(*) FROM html_game_revision", Long::class.java)
        migration.batch(false); migration.materials(false)
        assertEquals(revisions, jdbc.queryForObject("SELECT COUNT(*) FROM html_game_revision", Long::class.java))
        assertEquals(0L, migration.reconcile()["unresolved"])
        // A late source after the cutoff must invalidate the previous report.
        legacy(material.id, "<html><body>Late source</body></html>".toByteArray())
        kotlin.test.assertFailsWith<com.playsay.gateway.error.ProjectResponseException> { migration.reconcile() }
        migration.batch(false)
        assertEquals(0L, migration.reconcile()["unresolved"])
    }

    @Test
    fun `identical bytes without verified lineage retain independent identities and deleted originals do not remove game objects`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Independent")).body!!
        val bytes = "<html><body>Same</body></html>".toByteArray()
        val one = legacy(material.id, bytes)
        val two = legacy(material.id, bytes)
        migration.batch(false)
        val first = jdbc.queryForObject("SELECT game_id FROM html_game_legacy_alias WHERE asset_id=?", UUID::class.java, one)
        val second = jdbc.queryForObject("SELECT game_id FROM html_game_legacy_alias WHERE asset_id=?", UUID::class.java, two)
        kotlin.test.assertNotEquals(first, second)
        val hash = jdbc.queryForObject("SELECT sha256 FROM html_game_legacy_alias WHERE asset_id=?", String::class.java, one)
        assertEquals(hash, jdbc.queryForObject("SELECT sha256 FROM html_game_legacy_alias WHERE asset_id=?", String::class.java, two))
    }


    @Test
    fun `broken cyclic changed byte and cross author copy claims never merge independent identities`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val other = authentication(subject = "teacher-2", role = "ROLE_TEACHER")
        val first = materialCrudController.create(teacher, LessonMaterialRequest(title = "Lineage")).body!!
        val second = materialCrudController.create(other, LessonMaterialRequest(title = "Other owner")).body!!
        val bytes = "<html><body>Equal title and bytes</body></html>".toByteArray()
        val source = legacy(first.id, bytes)
        val cycleOne = legacy(first.id, bytes)
        val cycleTwo = legacy(first.id, bytes, cycleOne)
        val row = materialAssetRepo.findById(cycleOne).orElseThrow()
        row.metadata = objectMapper.readTree(row.metadata).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("copiedFromAssetId", cycleTwo.toString()).toString()
        materialAssetRepo.saveAndFlush(row)
        val broken = legacy(first.id, bytes, UUID.randomUUID())
        val changed = legacy(first.id, "<html><body>Different bytes</body></html>".toByteArray(), source)
        val crossOwner = legacy(second.id, bytes, source)
        assertTrue(migration.batch(false).outcomes.none { it.outcome == "BLOCKED" })
        val targets = listOf(source, cycleOne, cycleTwo, broken, changed, crossOwner).map { jdbc.queryForObject("SELECT game_id FROM html_game_legacy_alias WHERE asset_id=?", UUID::class.java, it) }
        assertEquals(6, targets.toSet().size)
    }


    @Test
    fun `concurrent material edit survives failed conversion and a resumed pass preserves it`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Concurrent edit")).body!!
        val source = legacy(material.id, "<html><body>Concurrent game</body></html>".toByteArray())
        val document = """{"schemaVersion":1,"pages":[{"id":"page","blocks":[{"id":"same-block","type":"htmlGame","url":"material-asset:$source"}]}]}"""
        jdbc.update("UPDATE lesson_material SET document=? WHERE id=?", document, material.id)
        migration.batch(false)
        val changed = objectMapper.readTree(document).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("concurrentNote", "Retain my edit").toString()
        val cas = "UPDATE lesson_material SET document=?,updated_at=? WHERE id=? AND document=? AND updated_at=?"
        val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
        val injected = java.util.concurrent.atomic.AtomicBoolean(false)
        org.mockito.Mockito.doAnswer { call ->
            if (call.arguments[3] == material.id && injected.compareAndSet(false, true)) executor.submit {
                jdbc.update("UPDATE lesson_material SET document=?,updated_at=? WHERE id=?", changed, java.sql.Timestamp.from(Instant.now()), material.id)
            }.get(5, java.util.concurrent.TimeUnit.SECONDS)
            call.callRealMethod()
        }.`when`(jdbc).update(org.mockito.ArgumentMatchers.eq(cas) ?: cas, org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any())
        try {
            val error = kotlin.test.assertFailsWith<com.playsay.gateway.error.ProjectResponseException> { migration.materials(false) }
            assertEquals("GAME_MATERIAL_CONFLICT", error.errorCode)
            assertEquals(changed, jdbc.queryForObject("SELECT document FROM lesson_material WHERE id=?", String::class.java, material.id))
        } finally { org.mockito.Mockito.reset(jdbc); executor.shutdownNow() }
        migration.materials(false)
        val recovered = materialCrudController.get(teacher, material.id).document
        assertEquals("Retain my edit", recovered.path("concurrentNote").asText())
        assertEquals("same-block", recovered.path("pages").first().path("blocks").first().path("id").asText())
        assertTrue(recovered.path("pages").first().path("blocks").first().hasNonNull("gameRevisionId"))
    }

    private fun legacy(materialId: UUID, bytes: ByteArray, copiedFrom: UUID? = null): UUID {
        val id = UUID.randomUUID()
        val key = "synthetic-legacy/$id.html"
        objects.putObject(key, bytes, "text/html")
        val metadata = objectMapper.createObjectNode().put("gameTitle", "Legacy race").put("syncCompatibility", "LEGACY_PREDICTIVE")
        if (copiedFrom != null) metadata.put("copiedFromAssetId", copiedFrom.toString())
        materialAssetRepo.saveAndFlush(MaterialAssetEntity(id = id, materialId = materialId, kind = "HTML_GAME", provider = "UPLOADED", storageKey = key, metadata = metadata.toString(), createdAt = Instant.now()))
        return id
    }
}
