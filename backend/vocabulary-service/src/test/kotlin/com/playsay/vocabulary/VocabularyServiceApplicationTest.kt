package com.playsay.vocabulary

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
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class VocabularyServiceApplicationTest @Autowired constructor(
    private val jdbcTemplate: JdbcTemplate,
    private val dataSource: DataSource,
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
    }
}
