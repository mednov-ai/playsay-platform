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

class KeyboardCatalogApiTest : KeyboardApiTestFixture() {
    @Test
    fun `current user is resolved from keycloak token`() {
        val me = meController.me(keyboardAuthentication())

        assertEquals("student-keycloak-subject", me.subject)
        assertEquals("student@example.com", me.email)
        assertEquals(listOf("STUDENT"), me.roles)
    }

    @Test
    fun `english chord sets include code ngrams for programming languages`() {
        val codeSets = chordSetController.list(layout = "EN", difficulty = null)
            .filter { it.title.startsWith("CODE · ") }

        assertEquals(
            listOf(
                "CODE · Python · Trigrams",
                "CODE · JavaScript · Trigrams",
                "CODE · TypeScript · Trigrams",
                "CODE · Java · Trigrams",
                "CODE · Kotlin · Trigrams",
                "CODE · C# · Trigrams",
                "CODE · C++ · Trigrams",
                "CODE · Swift · Trigrams",
                "CODE · Go · Trigrams",
                "CODE · Mixed · Trigrams",
                "CODE · Python · Quadgrams",
                "CODE · JavaScript · Quadgrams",
                "CODE · TypeScript · Quadgrams",
                "CODE · Java · Quadgrams",
                "CODE · Kotlin · Quadgrams",
                "CODE · C# · Quadgrams",
                "CODE · C++ · Quadgrams",
                "CODE · Swift · Quadgrams",
                "CODE · Go · Quadgrams",
                "CODE · Mixed · Quadgrams",
                "CODE · Python · Long",
                "CODE · JavaScript · Long",
                "CODE · TypeScript · Long",
                "CODE · Java · Long",
                "CODE · Kotlin · Long",
                "CODE · C# · Long",
                "CODE · C++ · Long",
                "CODE · Swift · Long",
                "CODE · Go · Long",
                "CODE · Mixed · Long",
            ),
            codeSets.map { it.title },
        )
        assertTrue(codeSets.all { set -> set.chords.size >= 48 })
        assertTrue(codeSets.all { set -> set.chords.all { chord -> chord.length in 3..8 } })
        assertTrue(codeSets.any { set -> set.chords.any { chord -> Regex("[{}()\\[\\]#:?+*=><]").containsMatchIn(chord) } })
    }

    @Test
    fun `combined code practice context is stored with training result`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()

        val saved = trainingController.submit(
            keyboardAuthentication(subject = "code-combo-subject"),
            SubmitResultRequest(
                clientResultId = "code-combo-1",
                chordSetId = 40,
                speedCpm = 180.0,
                averageCpm = 180.0,
                cadence = 0.82,
                accuracy = 0.97,
                errors = 1,
                characterCount = 180,
                correctCount = 179,
                durationMs = 60_000,
                perChar = mapOf("{" to 1),
                perChord = mapOf("fun" to 1),
                practiceContext = mapOf(
                    "practiceKind" to "CODE_COMBO",
                    "codeLanguages" to listOf("typescript", "kotlin"),
                    "difficultyBand" to "trigrams",
                    "title" to "CODE · TypeScript + Kotlin · Trigrams",
                ),
            ),
        )
        val repeated = trainingController.submit(
            keyboardAuthentication(subject = "code-combo-subject"),
            SubmitResultRequest(
                clientResultId = "code-combo-1",
                chordSetId = 40,
                speedCpm = 180.0,
                averageCpm = 180.0,
                cadence = 0.82,
                accuracy = 0.97,
                errors = 1,
                characterCount = 180,
                correctCount = 179,
                durationMs = 60_000,
                practiceContext = mapOf("practiceKind" to "CODE_COMBO"),
            ),
        )

        assertEquals("CODE_COMBO", saved.trainingResult.practiceContext["practiceKind"])
        assertEquals(listOf("typescript", "kotlin"), saved.trainingResult.practiceContext["codeLanguages"])
        assertEquals(saved.trainingResult.practiceContext, repeated.trainingResult.practiceContext)
    }

    @Test
    fun `authenticated vocabulary result enqueues one stable serialized outbox event`() {
        keyboardVocabularyResultOutboxRepo.deleteAllInBatch()
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        val sessionId = UUID.randomUUID()
        val itemId = UUID.randomUUID()
        val entryId = UUID.randomUUID()
        val request = SubmitResultRequest(
            clientResultId = "vocabulary-result-1",
            chordSetId = chordSetController.list(layout = "EN", difficulty = null).first().id,
            speedCpm = 150.0,
            averageCpm = 145.0,
            cadence = 0.8,
            accuracy = 0.92,
            errors = 2,
            characterCount = 100,
            correctCount = 98,
            durationMs = 40_000,
            perChord = mapOf("honey" to 2),
            practiceContext = mapOf(
                "practiceKind" to "VOCABULARY",
                "vocabularySessionId" to sessionId.toString(),
                "vocabularyItemIds" to listOf(itemId.toString()),
                "vocabularyEntryIds" to listOf(entryId.toString()),
                "vocabularyWords" to listOf("honey"),
            ),
        )

        val saved = trainingController.submit(keyboardAuthentication(subject = "vocabulary-subject"), request)
        val repeated = trainingController.submit(keyboardAuthentication(subject = "vocabulary-subject"), request)
        val event = keyboardVocabularyResultOutboxRepo.findAll().single()
        val payload = jacksonObjectMapper().readTree(event.payload)

        assertEquals(saved.trainingResult.id, repeated.trainingResult.id)
        assertEquals(saved.trainingResult.id, event.trainingResultId)
        assertEquals(sessionId, event.sessionId)
        assertEquals(IntegrationDeliveryState.PENDING.persistedValue, event.status)
        assertEquals("vocabulary-result-1", payload.path("clientResultId").asText())
        assertEquals(itemId.toString(), payload.path("attempts").path(0).path("itemId").asText())
        assertEquals(entryId.toString(), payload.path("attempts").path(0).path("entryId").asText())
        assertEquals(2, payload.path("attempts").path(0).path("errors").asInt())
    }

}
