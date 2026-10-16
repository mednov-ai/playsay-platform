package com.playsay.gateway

import com.playsay.gateway.controller.HtmlGameLibraryController
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.MaterialObjectStorage
import com.playsay.gateway.service.game.HtmlGameLibraryMigrationService
import java.util.UUID
import java.nio.file.Files
import java.sql.DriverManager
import kotlin.test.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource

@TestPropertySource(properties = ["playsay.games.writes-enabled=false"])
class HtmlGameRecoveryIntegrationTest : MaterialControllerTestFixture() {
    @Autowired private lateinit var games: HtmlGameLibraryController
    @Autowired private lateinit var migration: HtmlGameLibraryMigrationService
    @Autowired private lateinit var objects: MaterialObjectStorage
    @Autowired private lateinit var jdbc: JdbcTemplate

    @Test
    fun `synthetic backup restore preserves mappings and compatible readers with new writes disabled`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Recovery")).body!!
        val id = UUID.randomUUID()
        val html = "<html><body>Recoverable legacy bytes</body></html>".toByteArray()
        val key = "synthetic-backup/$id"
        objects.putObject(key, html, "text/html")
        materialAssetRepo.saveAndFlush(MaterialAssetEntity(id = id, materialId = material.id, kind = "HTML_GAME", storageKey = key, metadata = "{}"))
        // Legacy fixture is written before conversion, representing a pre-cutover backup source.
        jdbc.update("UPDATE lesson_material SET document=? WHERE id=?", """{"schemaVersion":1,"pages":[{"id":"page","blocks":[{"id":"block","type":"htmlGame","url":"material-asset:$id"}]}]}""", material.id)
        migration.batch(false); migration.materials(false)
        assertEquals(0L, migration.reconcile()["unresolved"])
        val alias = jdbc.queryForMap("SELECT game_id,revision_id FROM html_game_legacy_alias WHERE asset_id=?", id)
        assertTrue(html.contentEquals(games.content(teacher, alias["game_id"] as UUID, alias["revision_id"] as UUID, material.id).body!!))
        assertEquals("GAME_WRITES_DISABLED", assertFailsWith<ProjectResponseException> { games.upload(teacher, htmlFile(), UUID.randomUUID()) }.errorCode)
        val ownedKey = jdbc.queryForObject("SELECT b.storage_key FROM html_game_revision r JOIN html_game_blob b ON b.id=r.blob_id WHERE r.id=?", String::class.java, alias["revision_id"])!!
        val objectBackup = listOf(key, ownedKey).map(objects::getObject)
        val restoredObjects = com.playsay.gateway.service.InMemoryMaterialObjectStorage()
        objectBackup.forEach { restoredObjects.putObject(it.key, it.bytes, it.contentType) }
        val backup = Files.createTempFile("honey-game-backup-", ".sql")
        try {
            jdbc.execute("SCRIPT TO '${backup.toString().replace("'", "''")}'")
            DriverManager.getConnection("jdbc:h2:mem:game-restore-${UUID.randomUUID()};MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE", "sa", "").use { restored ->
                restored.createStatement().use { statement ->
                    statement.execute("RUNSCRIPT FROM '${backup.toString().replace("'", "''")}'")
                    statement.executeQuery("SELECT game_id,revision_id FROM html_game_legacy_alias WHERE asset_id='$id'").use { row -> assertTrue(row.next()); assertEquals(alias["game_id"].toString(), row.getString(1)); assertEquals(alias["revision_id"].toString(), row.getString(2)) }
                    statement.executeQuery("SELECT b.storage_key FROM html_game_revision r JOIN html_game_blob b ON b.id=r.blob_id WHERE r.id='${alias["revision_id"]}'").use { row -> assertTrue(row.next()); assertTrue(html.contentEquals(restoredObjects.getObject(row.getString(1)).bytes)) }
                    statement.executeQuery("SELECT document FROM lesson_material WHERE id='${material.id}'").use { row -> assertTrue(row.next()); assertTrue(row.getString(1).contains("gameRevisionId")) }
                }
            }
            // Reader rollback leaves original objects and the verified new objects available.
            assertTrue(html.contentEquals(objects.getObject(key).bytes))
            assertTrue(html.contentEquals(materialAssetController.assetContent(teacher, material.id, id).body!!))
        } finally { Files.deleteIfExists(backup) }
    }
}
