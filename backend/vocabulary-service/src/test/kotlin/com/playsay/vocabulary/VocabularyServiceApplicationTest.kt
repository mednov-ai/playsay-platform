package com.playsay.vocabulary

import com.playsay.vocabulary.service.VocabularyUserDataService
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:vocabulary;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.liquibase.enabled=true",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost/unused-jwks",
        "playsay.user-data.service-token=test-token",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class VocabularyServiceApplicationTest @Autowired constructor(
    private val jdbcTemplate: JdbcTemplate,
    private val dataSource: DataSource,
    private val userData: VocabularyUserDataService,
) {
    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@VocabularyServiceApplicationTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @Test
    fun `liquibase creates vocabulary tables`() {
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from vocabulary_entries", Long::class.java))
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from vocabulary_occurrences", Long::class.java))
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from vocabulary_practice_plans", Long::class.java))
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from vocabulary_learning_evidence", Long::class.java))
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from vocabulary_projection_queue", Long::class.java))
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from vocabulary_lexical_senses", Long::class.java))
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from vocabulary_selection_recipes", Long::class.java))
        assertEquals(
            4,
            jdbcTemplate.queryForObject(
                """
                    select count(*)
                      from information_schema.columns
                     where table_name = 'vocabulary_practice_items'
                       and column_name in ('schema_version', 'accepted_answers_json', 'content_json', 'affects_schedule')
                """.trimIndent(),
                Int::class.java,
            ),
        )
        assertEquals(
            6,
            jdbcTemplate.queryForObject(
                """
                    select count(*)
                      from information_schema.columns
                     where table_name = 'vocabulary_skill_states'
                       and column_name in (
                           'policy_version', 'evidence_watermark', 'difficulty_score',
                           'review_reason', 'skill_available', 'last_evidence_at'
                       )
                """.trimIndent(),
                Int::class.java,
            ),
        )
    }

    @Test
    fun `purge removes plans created for the learner even when a teacher owns the plan`() {
        val now = Timestamp.from(Instant.parse("2026-07-29T12:00:00Z"))
        jdbcTemplate.update(
            """
                insert into vocabulary_practice_plans (
                    id, created_by_subject, revision, delivery, mode, payload_json,
                    expires_at, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            UUID.randomUUID(),
            "teacher-subject",
            1L,
            "HOMEWORK",
            "BALANCED",
            """{"owners":[{"ownerSubject":"learner-subject","items":[]}]}""",
            now,
            now,
            now,
        )

        userData.purge("learner-subject", "test-token")

        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from vocabulary_practice_plans", Long::class.java))
    }
}
