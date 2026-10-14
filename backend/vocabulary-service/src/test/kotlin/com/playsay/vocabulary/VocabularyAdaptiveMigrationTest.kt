package com.playsay.vocabulary

import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource

class VocabularyAdaptiveMigrationTest {
    @Test
    fun `adaptive migration upgrades the existing vocabulary schema without losing entries`() {
        val dataSource = DriverManagerDataSource(
            "jdbc:h2:mem:vocabulary_upgrade_${UUID.randomUUID().toString().replace("-", "")};MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
            "sa",
            "",
        ).apply { setDriverClassName("org.h2.Driver") }
        val jdbc = JdbcTemplate(dataSource)
        listOf(
            "classpath:db/changelog/2026-07-11-001-vocabulary.xml",
            "classpath:db/changelog/2026-07-28-001-vocabulary-practice.xml",
            "classpath:db/changelog/2026-07-29-001-personal-practice-v2.xml",
        ).forEach { changelog -> migrate(dataSource, changelog) }
        val entryId = UUID.randomUUID()
        val now = Timestamp.from(Instant.parse("2026-08-20T12:00:00Z"))
        jdbc.update(
            """
                insert into vocabulary_entries (
                    id, owner_subject, source_text, normalized_source, source_language,
                    target_language, translation, translation_state, status, practice_paused,
                    created_by_subject, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            entryId,
            "existing-learner",
            "steady",
            "steady",
            "en",
            "ru",
            "устойчивый",
            "CONFIRMED",
            "ACTIVE",
            false,
            "existing-learner",
            now,
            now,
        )

        migrate(dataSource, "classpath:db/changelog/2026-08-20-001-adaptive-vocabulary-foundation.xml")
        migrate(dataSource, "classpath:db/changelog/2026-08-20-001-adaptive-vocabulary-foundation.xml")

        assertEquals(entryId, jdbc.queryForObject("select id from vocabulary_entries", UUID::class.java))
        assertEquals(false, jdbc.queryForObject("select favorite from vocabulary_entries", Boolean::class.java))
        assertEquals(
            4,
            jdbc.queryForObject(
                """
                    select count(*)
                      from information_schema.tables
                     where lower(table_name) in (
                         'vocabulary_learning_evidence', 'vocabulary_projection_queue',
                         'vocabulary_lexical_senses', 'vocabulary_selection_recipes'
                     )
                """.trimIndent(),
                Int::class.java,
            ),
        )
    }

    private fun migrate(dataSource: DataSource, changelog: String) {
        SpringLiquibase().apply {
            this.dataSource = dataSource
            changeLog = changelog
        }.afterPropertiesSet()
    }
}
