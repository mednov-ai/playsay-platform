package com.playsay.keyboard

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.integration.delivery.IntegrationDeliveryState
import com.playsay.keyboard.controller.ChordSetController
import com.playsay.keyboard.controller.AnonymousController
import com.playsay.keyboard.controller.MeController
import com.playsay.keyboard.controller.TrainingController
import com.playsay.keyboard.dto.ClaimAnonymousProgressRequest
import com.playsay.keyboard.dto.ResolveAnonymousProfileRequest
import com.playsay.keyboard.dto.ResetAnonymousProfileRequest
import com.playsay.keyboard.dto.SubmitAnonymousResultRequest
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.dto.TechniqueAdviceResponse
import com.playsay.keyboard.entity.TechniqueAdviceCacheEntity
import com.playsay.keyboard.dto.UpdateAnonymousProfileRequest
import com.playsay.keyboard.repo.AnonymousProfileRepo
import com.playsay.keyboard.repo.GamificationEventRepo
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import com.playsay.keyboard.repo.KeyboardVocabularyResultOutboxRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import com.playsay.keyboard.repo.TechniqueAdviceCacheRepo
import com.playsay.keyboard.service.TechniqueAdviceService
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.TestInstance
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import javax.sql.DataSource
import java.util.Locale
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:keyboard-api;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.keyboard.anonymous.fingerprint-secret=test-secret",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
abstract class KeyboardApiTestFixture {
    @Autowired protected lateinit var anonymousController: AnonymousController
    @Autowired protected lateinit var chordSetController: ChordSetController
    @Autowired protected lateinit var trainingController: TrainingController
    @Autowired protected lateinit var meController: MeController
    @Autowired protected lateinit var anonymousProfileRepo: AnonymousProfileRepo
    @Autowired protected lateinit var gamificationEventRepo: GamificationEventRepo
    @Autowired protected lateinit var gamificationProfileRepo: GamificationProfileRepo
    @Autowired protected lateinit var layoutMasteryProfileRepo: LayoutMasteryProfileRepo
    @Autowired protected lateinit var keyboardVocabularyResultOutboxRepo: KeyboardVocabularyResultOutboxRepo
    @Autowired protected lateinit var trainingResultRepo: TrainingResultRepo
    @Autowired protected lateinit var techniqueAdviceCacheRepo: TechniqueAdviceCacheRepo
    @Autowired protected lateinit var techniqueAdviceService: TechniqueAdviceService
    @Autowired protected lateinit var dataSource: DataSource

    @BeforeAll
    fun migrateDatabase() = synchronized(migrationLock) {
        if (!databaseMigrated) {
            SpringLiquibase().apply {
                this.dataSource = this@KeyboardApiTestFixture.dataSource
                changeLog = "classpath:db/changelog/db.changelog-master.xml"
                contexts = "test"
            }.afterPropertiesSet()
            databaseMigrated = true
        }
    }

    protected fun calibrationRequest(chordSetId: Long, clientResultId: String, averageCpm: Double): SubmitResultRequest =
        SubmitResultRequest(
            clientResultId = clientResultId,
            chordSetId = chordSetId,
            lessonKind = "STANDARD",
            speedCpm = averageCpm,
            averageCpm = averageCpm,
            cadence = 0.86,
            accuracy = 0.98,
            errors = 0,
            characterCount = averageCpm.toInt(),
            correctCount = averageCpm.toInt(),
            durationMs = 60_000,
        )

    protected fun keyboardAuthentication(
        subject: String = "student-keycloak-subject",
        email: String = "student@example.com",
    ): JwtAuthenticationToken =
        JwtAuthenticationToken(
            Jwt.withTokenValue("keyboard-test-token")
                .header("alg", "none")
                .subject(subject)
                .claim("email", email)
                .claim("preferred_username", "student")
                .build(),
            listOf(SimpleGrantedAuthority("ROLE_STUDENT")),
        )

    protected fun anonymousRequest(): MockHttpServletRequest =
        MockHttpServletRequest().apply {
            remoteAddr = "203.0.113.42"
            addHeader("User-Agent", "KeyboardApiTest")
            addHeader("X-Forwarded-For", "203.0.113.42")
        }

    private companion object {
        val migrationLock = Any()
        var databaseMigrated = false
    }
}
