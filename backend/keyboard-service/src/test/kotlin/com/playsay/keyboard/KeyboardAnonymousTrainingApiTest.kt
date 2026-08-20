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

class KeyboardAnonymousTrainingApiTest : KeyboardApiTestFixture() {
    @Test
    fun `anonymous profile can be resolved and named without jwt`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        anonymousProfileRepo.deleteAllInBatch()

        val request = anonymousRequest()
        val resolved = anonymousController.resolve(
            ResolveAnonymousProfileRequest(deviceId = "device-1"),
            request,
        )
        assertEquals("device-1", resolved.deviceId)
        assertEquals(null, resolved.displayName)

        val updated = anonymousController.update(
            UpdateAnonymousProfileRequest(deviceId = "device-1", displayName = "  Masha  "),
            request,
        )

        assertEquals(resolved.id, updated.id)
        assertEquals("Masha", updated.displayName)
        assertEquals("Masha", anonymousController.resolve(ResolveAnonymousProfileRequest("device-1"), request).displayName)
    }

    @Test
    fun `anonymous severe result returns a focus lesson`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        anonymousProfileRepo.deleteAllInBatch()

        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        val saved = anonymousController.submit(
            SubmitAnonymousResultRequest(
                deviceId = "device-2",
                chordSetId = chordSetId,
                lessonKind = "STANDARD",
                speedCpm = 118.0,
                accuracy = 0.7,
                errors = 5,
                durationMs = 35_000,
                perFinger = mapOf("leftIndex" to 5),
                perChar = mapOf("t" to 4),
                perChord = mapOf("th" to 3),
            ),
            anonymousRequest(),
        )

        assertEquals("EN", saved.trainingResult.layout)
        assertEquals("SEVERE", saved.focusLesson?.reason)
        assertTrue(saved.focusLesson?.problemKeys.orEmpty().contains("th"))
    }

    @Test
    fun `anonymous moderate repeated errors return focus after three sessions`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        anonymousProfileRepo.deleteAllInBatch()

        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        val request = anonymousRequest()

        repeat(2) {
            val saved = anonymousController.submit(
                SubmitAnonymousResultRequest(
                    deviceId = "device-3",
                    chordSetId = chordSetId,
                    lessonKind = "STANDARD",
                    speedCpm = 180.0,
                    accuracy = 0.9,
                    errors = 2,
                    durationMs = 30_000,
                    perFinger = mapOf("leftIndex" to 2),
                    perChar = mapOf("t" to 2),
                    perChord = mapOf("th" to 2),
                ),
                request,
            )
            assertEquals(null, saved.focusLesson)
        }

        val third = anonymousController.submit(
            SubmitAnonymousResultRequest(
                deviceId = "device-3",
                chordSetId = chordSetId,
                lessonKind = "STANDARD",
                speedCpm = 180.0,
                accuracy = 0.9,
                errors = 2,
                durationMs = 30_000,
                perFinger = mapOf("leftIndex" to 2),
                perChar = mapOf("t" to 2),
                perChord = mapOf("th" to 2),
            ),
            request,
        )

        assertEquals("MODERATE", third.focusLesson?.reason)
        assertTrue(third.focusLesson?.problemKeys.orEmpty().contains("th"))
    }

    @Test
    fun `anonymous profile reset deletes anonymous progress and is idempotent`() {
        gamificationEventRepo.deleteAllInBatch()
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        gamificationProfileRepo.deleteAllInBatch()
        anonymousProfileRepo.deleteAllInBatch()

        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        val request = anonymousRequest()
        (1..3).forEach { index ->
            anonymousController.submit(
                SubmitAnonymousResultRequest(
                    deviceId = "device-reset",
                    clientResultId = "anonymous-reset-$index",
                    chordSetId = chordSetId,
                    lessonKind = "STANDARD",
                    speedCpm = 180.0 + index,
                    averageCpm = 180.0 + index,
                    cadence = 0.82,
                    accuracy = 0.98,
                    errors = 0,
                    characterCount = 180 + index,
                    correctCount = 180 + index,
                    durationMs = 60_000,
                    clientTimezone = "Europe/Moscow",
                    localTrainingDate = "2026-06-${index.toString().padStart(2, '0')}",
                ),
                request,
            )
        }
        val profile = anonymousProfileRepo.findByDeviceId("device-reset") ?: error("anonymous profile was not created")

        assertEquals(3, trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id).size)
        assertTrue(layoutMasteryProfileRepo.findByAnonymousProfileIdOrderByLayoutAsc(profile.id).isNotEmpty())
        assertNotNull(gamificationProfileRepo.findByAnonymousProfileId(profile.id))
        assertTrue(gamificationEventRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id).isNotEmpty())

        anonymousController.reset(ResetAnonymousProfileRequest(deviceId = "device-reset"))
        anonymousController.reset(ResetAnonymousProfileRequest(deviceId = "device-reset"))
        anonymousController.reset(ResetAnonymousProfileRequest(deviceId = "unknown-device"))

        assertNull(anonymousProfileRepo.findByDeviceId("device-reset"))
        assertTrue(trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id).isEmpty())
        assertTrue(layoutMasteryProfileRepo.findByAnonymousProfileIdOrderByLayoutAsc(profile.id).isEmpty())
        assertNull(gamificationProfileRepo.findByAnonymousProfileId(profile.id))
        assertTrue(gamificationEventRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id).isEmpty())
    }

    @Test
    fun `authenticated user can claim anonymous progress once`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        anonymousProfileRepo.deleteAllInBatch()
        gamificationProfileRepo.deleteAllInBatch()

        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        val request = anonymousRequest()
        anonymousController.submit(
            SubmitAnonymousResultRequest(
                deviceId = "device-claim",
                chordSetId = chordSetId,
                lessonKind = "STANDARD",
                speedCpm = 172.0,
                accuracy = 0.91,
                errors = 3,
                durationMs = 31_000,
                perFinger = mapOf("leftIndex" to 3),
                perChar = mapOf("t" to 3),
                perChord = mapOf("th" to 3),
            ),
            request,
        )

        val profile = anonymousProfileRepo.findByDeviceId("device-claim") ?: error("anonymous profile was not created")
        val claimed = trainingController.claimAnonymous(
            keyboardAuthentication(),
            ClaimAnonymousProgressRequest(deviceId = "device-claim"),
        )
        val repeated = trainingController.claimAnonymous(
            keyboardAuthentication(),
            ClaimAnonymousProgressRequest(deviceId = "device-claim"),
        )

        assertEquals(1, claimed.claimedResults)
        assertEquals(1, claimed.progress.sessions)
        assertEquals(0, repeated.claimedResults)
        assertEquals(1, repeated.progress.sessions)
        assertTrue(trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id).isEmpty())
        assertEquals(1, trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc("student-keycloak-subject").size)
        assertTrue(assertNotNull(claimed.progress.gamification?.layoutMastery?.get("EN")?.masteryCpm) > 0.0)
    }

}
