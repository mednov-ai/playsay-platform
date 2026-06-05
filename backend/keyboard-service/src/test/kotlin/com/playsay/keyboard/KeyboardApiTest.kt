package com.playsay.keyboard

import com.playsay.keyboard.controller.ChordSetController
import com.playsay.keyboard.controller.MeController
import com.playsay.keyboard.controller.TrainingController
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.repo.TrainingResultRepo
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:keyboard-api;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class KeyboardApiTest @Autowired constructor(
    private val chordSetController: ChordSetController,
    private val trainingController: TrainingController,
    private val meController: MeController,
    private val trainingResultRepo: TrainingResultRepo,
    private val dataSource: DataSource,
) {
    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@KeyboardApiTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
            contexts = "test"
        }.afterPropertiesSet()
    }

    @Test
    fun `current user is resolved from keycloak token`() {
        val me = meController.me(keyboardAuthentication())

        assertEquals("student-keycloak-subject", me.subject)
        assertEquals("student@example.com", me.email)
        assertEquals(listOf("STUDENT"), me.roles)
    }

    @Test
    fun `authenticated user can train and see progress`() {
        trainingResultRepo.deleteAllInBatch()

        val chordSets = chordSetController.list(layout = "EN", difficulty = null)
        assertTrue(chordSets.isNotEmpty())
        assertEquals("EN", chordSets[0].layout)
        val chordSetId = chordSets[0].id

        val saved = trainingController.submit(
            keyboardAuthentication(),
            SubmitResultRequest(
                chordSetId = chordSetId,
                speedCpm = 180.5,
                accuracy = 0.96,
                errors = 2,
                durationMs = 42_000,
                perFinger = mapOf("leftIndex" to 2),
            ),
        )
        assertEquals(chordSetId, saved.chordSetId)
        assertEquals(180.5, saved.speedCpm)

        val progress = trainingController.progress(keyboardAuthentication())
        assertEquals(1, progress.sessions)
        assertEquals(180.5, progress.bestSpeedCpm)
        assertEquals(0.96, progress.avgAccuracy)
        assertEquals("leftIndex", progress.weakFingers[0].finger)
        assertEquals(2, progress.weakFingers[0].errors)
    }

    private fun keyboardAuthentication(): JwtAuthenticationToken =
        JwtAuthenticationToken(
            Jwt.withTokenValue("keyboard-test-token")
                .header("alg", "none")
                .subject("student-keycloak-subject")
                .claim("email", "student@example.com")
                .claim("preferred_username", "student")
                .build(),
            listOf(SimpleGrantedAuthority("ROLE_STUDENT")),
        )
}
