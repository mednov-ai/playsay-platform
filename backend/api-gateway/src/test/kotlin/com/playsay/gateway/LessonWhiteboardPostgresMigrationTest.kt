package com.playsay.gateway

import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource

/** Requires a disposable local PostgreSQL 17 database. Never point this fixture at an existing contour. */
@EnabledIfEnvironmentVariable(named = "WHITEBOARD_TEST_POSTGRES_URL", matches = ".+")
class LessonWhiteboardPostgresMigrationTest {
    @Test fun `standalone PostgreSQL migration safely classifies legacy rows and preserves later manual choices`() {
        val dataSource = DriverManagerDataSource(requireNotNull(System.getenv("WHITEBOARD_TEST_POSTGRES_URL")))
        val jdbc = JdbcTemplate(dataSource)
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'", Int::class.java))
        val source = Path.of("src/main/resources/db/changelog").toAbsolutePath()
        val copied = Files.createTempDirectory("honey-whiteboard-changelog-")
        try {
            Files.walk(source).use { files -> files.forEach { file ->
                val target = copied.resolve(source.relativize(file).toString())
                if (Files.isDirectory(file)) Files.createDirectories(target) else Files.copy(file, target)
            } }
            val master = copied.resolve("db.changelog-master.xml")
            val original = Files.readString(master)
            Files.writeString(master, original.lines().filterNot { it.contains("2026-10-16-001-lesson-whiteboards.xml") }.joinToString("\n"))
            fun migrate() = SpringLiquibase().apply { this.dataSource = dataSource; changeLog = master.toUri().toString() }.afterPropertiesSet()
            migrate()
            val valid = """{"kind":"LIVE_LESSON_COPY","sourceLessonId":"${UUID.randomUUID()}"}"""
            val values = listOf(valid, "{}", "not json", """{"kind":"LIVE_LESSON_COPY","sourceLessonId":"1-1-1-1-1"}""", """{"kind":"OTHER","sourceLessonId":"${UUID.randomUUID()}"}""", "null")
            val ids = values.map { meta ->
                UUID.randomUUID().also { id -> jdbc.update("""INSERT INTO lesson_material
                    (id,title,language,cefr_level,visibility,status,document,source_meta,scoring_rubric,topic_tags,skill_tags,created_at,updated_at)
                    VALUES (?, 'Legacy', 'en', 'A2', 'PRIVATE', 'DRAFT', '{"preserve":true}', ?, '{}', '[]', '[]', now(), now())""", id, meta) }
            }
            Files.writeString(master, original); migrate()
            assertEquals(listOf(true,false,false,false,false,false), ids.map { jdbc.queryForObject("SELECT is_lesson_material FROM lesson_material WHERE id=?", Boolean::class.java,it) })
            jdbc.update("UPDATE lesson_material SET is_lesson_material=false WHERE id=?",ids[0])
            val delta = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(copied.resolve("2026-10-16-001-lesson-whiteboards.xml").toFile())
            val backfill = delta.getElementsByTagName("sql").item(0).textContent
            jdbc.execute(backfill)
            assertFalse(jdbc.queryForObject("SELECT is_lesson_material FROM lesson_material WHERE id=?",Boolean::class.java,ids[0])!!)
            assertTrue(ids.all { jdbc.queryForObject("SELECT document FROM lesson_material WHERE id=?",String::class.java,it)=="{\"preserve\":true}" })
            assertEquals(values,ids.map { jdbc.queryForObject("SELECT source_meta FROM lesson_material WHERE id=?",String::class.java,it) })
            migrate()
            assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM databasechangelog WHERE id='2026-10-16-lesson-material-provenance-backfill'",Int::class.java))
            assertEquals(6,jdbc.queryForObject("SELECT count(*) FROM lesson_material WHERE lesson_material_category_set",Int::class.java))
        } finally { Files.walk(copied).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach(Files::delete) } }
    }
}
