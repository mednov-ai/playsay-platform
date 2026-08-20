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

class KeyboardAuthenticatedTrainingApiTest : KeyboardApiTestFixture() {
    @Test
    fun `authenticated user can train and see progress`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()

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
        assertEquals(chordSetId, saved.trainingResult.chordSetId)
        assertEquals("EN", saved.trainingResult.layout)
        assertEquals(180.5, saved.trainingResult.speedCpm)

        val progress = trainingController.progress(keyboardAuthentication())
        assertEquals(1, progress.sessions)
        assertEquals(180.5, progress.bestSpeedCpm)
        assertEquals(0.96, progress.avgAccuracy)
        assertEquals("leftIndex", progress.weakFingers[0].finger)
        assertEquals(2, progress.weakFingers[0].errors)
    }

    @Test
    fun `authenticated result submission is idempotent by client result id and updates mastery once`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()

        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        val request = SubmitResultRequest(
            clientResultId = "client-result-1",
            chordSetId = chordSetId,
            lessonKind = "CALIBRATION",
            speedCpm = 220.0,
            averageCpm = 220.0,
            cadence = 0.88,
            accuracy = 0.97,
            errors = 1,
            characterCount = 220,
            correctCount = 219,
            durationMs = 60_000,
            perFinger = mapOf("leftIndex" to 1),
            clientTimezone = "Europe/Moscow",
            localTrainingDate = "2026-06-11",
        )

        val first = trainingController.submit(keyboardAuthentication(), request)
        val repeated = trainingController.submit(keyboardAuthentication(), request)

        assertEquals(first.trainingResult.id, repeated.trainingResult.id)
        assertEquals(1, trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc("student-keycloak-subject").size)
        assertTrue(assertNotNull(first.trainingResult.masteryCpm) > 0.0)
        assertEquals(0.0, repeated.trainingResult.masteryDelta)
        assertEquals("RULES", first.techniqueAdvice.source)
        assertEquals(1, first.progress.sessions)
        assertEquals(1, repeated.progress.sessions)
        assertEquals(first.gamification.masteryCpm, repeated.gamification.masteryCpm)
    }

    @Test
    fun `rules advice follows all supported locales and falls back to russian`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        val expectedStarts = mapOf(
            "ru" to "Ритм",
            "en" to "Rhythm",
            "de" to "Rhythmus",
            "fr" to "Le rythme",
        )

        expectedStarts.forEach { (language, expectedStart) ->
            val response = trainingController.submit(
                keyboardAuthentication(subject = "localized-advice-$language"),
                calibrationRequest(chordSetId, "localized-advice-$language", 180.0).copy(cadence = 0.5),
                Locale.forLanguageTag(language),
            )
            assertTrue(response.techniqueAdvice.primaryAdvice.startsWith(expectedStart))
            assertEquals("RULES", response.techniqueAdvice.source)
        }

        val fallback = trainingController.submit(
            keyboardAuthentication(subject = "localized-advice-fallback"),
            calibrationRequest(chordSetId, "localized-advice-fallback", 180.0).copy(cadence = 0.5),
            Locale.ITALIAN,
        )
        assertTrue(fallback.techniqueAdvice.primaryAdvice.startsWith("Ритм"))
    }

    @Test
    fun `idempotent result returns advice in the locale requested for each response`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        val auth = keyboardAuthentication(subject = "localized-idempotent-subject")
        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        val request = calibrationRequest(chordSetId, "localized-idempotent-result", 180.0).copy(cadence = 0.5)

        val english = trainingController.submit(auth, request, Locale.ENGLISH)
        val german = trainingController.submit(auth, request, Locale.GERMAN)

        assertEquals(english.trainingResult.id, german.trainingResult.id)
        assertTrue(english.techniqueAdvice.primaryAdvice.startsWith("Rhythm"))
        assertTrue(german.techniqueAdvice.primaryAdvice.startsWith("Rhythmus"))
        assertEquals(1, trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc("localized-idempotent-subject").size)
    }

    @Test
    fun `advice cache allows the same fingerprint once per locale`() {
        techniqueAdviceCacheRepo.deleteAllInBatch()
        val base = TechniqueAdviceCacheEntity(
            fingerprint = "same-fingerprint",
            locale = "ru",
            source = "AI",
            primaryAdvice = "Совет",
            drillSuggestion = "Упражнение",
            tone = "STEADY",
        )
        techniqueAdviceCacheRepo.saveAndFlush(base)
        techniqueAdviceCacheRepo.saveAndFlush(
            TechniqueAdviceCacheEntity(
                fingerprint = "same-fingerprint",
                locale = "en",
                source = "AI",
                primaryAdvice = "Advice",
                drillSuggestion = "Drill",
                tone = "STEADY",
            ),
        )

        assertEquals("Совет", techniqueAdviceCacheRepo.findByFingerprintAndLocale("same-fingerprint", "ru")?.primaryAdvice)
        assertEquals("Advice", techniqueAdviceCacheRepo.findByFingerprintAndLocale("same-fingerprint", "en")?.primaryAdvice)
    }

    @Test
    fun `ai request explicitly carries the target response language`() {
        val result = com.playsay.keyboard.entity.TrainingResultEntity(
            chordSetId = 1,
            speedCpm = 180.0,
            cadence = 0.8,
            accuracy = 0.98,
            errors = 0,
            durationMs = 60_000,
        )
        val request = techniqueAdviceService.aiRequest(
            result,
            listOf(result),
            TechniqueAdviceResponse("Conseil", "Exercice", "STEADY"),
            Locale.FRENCH,
        ).toString()

        assertTrue(request.contains("Write advice in French"))
        assertTrue(request.contains("responseLanguage"))
        assertTrue(request.contains("fr"))
    }

    @Test
    fun `mastery rewards stable rhythm and penalizes unstable rhythm`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()

        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        val first = trainingController.submit(
            keyboardAuthentication(),
            SubmitResultRequest(
                clientResultId = "mastery-stable-1",
                chordSetId = chordSetId,
                lessonKind = "CALIBRATION",
                speedCpm = 210.0,
                averageCpm = 210.0,
                cadence = 0.9,
                accuracy = 0.98,
                errors = 0,
                characterCount = 210,
                correctCount = 210,
                durationMs = 60_000,
            ),
        )
        val second = trainingController.submit(
            keyboardAuthentication(),
            SubmitResultRequest(
                clientResultId = "mastery-unstable-2",
                chordSetId = chordSetId,
                speedCpm = 260.0,
                averageCpm = 260.0,
                cadence = 0.42,
                accuracy = 0.9,
                errors = 12,
                characterCount = 260,
                correctCount = 248,
                durationMs = 60_000,
            ),
        )

        assertTrue(assertNotNull(first.trainingResult.masteryCpm) <= 210.0)
        assertTrue(assertNotNull(second.trainingResult.masteryCpm) < second.trainingResult.averageCpm)
        assertTrue(second.techniqueAdvice.primaryAdvice.isNotBlank())
        assertEquals("RHYTHM", second.techniqueAdvice.tone)
        assertEquals("RULES", second.techniqueAdvice.source)
    }

    @Test
    fun `mastery treats seventy percent rhythm as good when accuracy is high`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        gamificationProfileRepo.deleteAllInBatch()

        val auth = keyboardAuthentication(subject = "seventy-rhythm-subject")
        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        trainingController.submit(auth, calibrationRequest(chordSetId, "seventy-rhythm-1", 180.0))
        val result = trainingController.submit(
            auth,
            calibrationRequest(chordSetId, "seventy-rhythm-2", 240.0).copy(cadence = 0.70),
        )

        assertTrue(assertNotNull(result.trainingResult.masteryCpm) > 205.0)
        assertTrue(result.trainingResult.masteryDelta > 20.0)
    }

    @Test
    fun `mastery is tracked independently for each keyboard layout`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        gamificationProfileRepo.deleteAllInBatch()

        val auth = keyboardAuthentication(subject = "layout-mastery-subject")
        val enChordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        val ruChordSetId = chordSetController.list(layout = "RU", difficulty = null)[0].id

        val firstEn = trainingController.submit(auth, calibrationRequest(enChordSetId, "layout-mastery-en-1", 300.0))
        val firstRu = trainingController.submit(auth, calibrationRequest(ruChordSetId, "layout-mastery-ru-1", 80.0))
        val secondEn = trainingController.submit(auth, calibrationRequest(enChordSetId, "layout-mastery-en-2", 300.0))

        assertTrue(assertNotNull(firstEn.trainingResult.masteryCpm) >= 295.0)
        assertTrue(assertNotNull(firstRu.trainingResult.masteryCpm) < 100.0)
        assertTrue(assertNotNull(secondEn.trainingResult.masteryCpm) >= 295.0)
    }

    @Test
    fun `progress exposes mastery profiles for every trained layout`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        gamificationProfileRepo.deleteAllInBatch()

        val auth = keyboardAuthentication(subject = "layout-progress-subject")
        val enChordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id
        val ruChordSetId = chordSetController.list(layout = "RU", difficulty = null)[0].id

        trainingController.submit(auth, calibrationRequest(enChordSetId, "layout-progress-en", 260.0))
        trainingController.submit(auth, calibrationRequest(ruChordSetId, "layout-progress-ru", 140.0))

        val progress = trainingController.progress(auth)

        assertEquals(setOf("EN", "RU"), progress.gamification?.layoutMastery?.keys)
        assertTrue(assertNotNull(progress.gamification?.layoutMastery?.get("EN")?.masteryCpm) > 250.0)
        assertTrue(assertNotNull(progress.gamification?.layoutMastery?.get("RU")?.masteryCpm) < 150.0)
    }

    @Test
    fun `calibration completes after three saved standard lessons and emits one completion event`() {
        gamificationEventRepo.deleteAllInBatch()
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        gamificationProfileRepo.deleteAllInBatch()

        val auth = keyboardAuthentication(subject = "calibration-three-subject")
        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id

        val first = trainingController.submit(auth, calibrationRequest(chordSetId, "calibration-three-1", 180.0))
        val second = trainingController.submit(auth, calibrationRequest(chordSetId, "calibration-three-2", 190.0))
        val third = trainingController.submit(auth, calibrationRequest(chordSetId, "calibration-three-3", 200.0))
        val repeatedThird = trainingController.submit(auth, calibrationRequest(chordSetId, "calibration-three-3", 200.0))

        assertEquals(false, first.gamification.calibrated)
        assertEquals(1, first.gamification.calibrationSessions)
        assertEquals(false, second.gamification.calibrated)
        assertEquals(2, second.gamification.calibrationSessions)
        assertEquals(true, third.gamification.calibrated)
        assertEquals(3, third.gamification.calibrationSessions)
        assertEquals(3, third.gamification.calibrationTarget)
        assertNotNull(third.gamification.baselineMasteryCpm)
        assertNotNull(third.gamification.leagueLevel)
        assertTrue(third.events.any { event -> event.type == "CALIBRATION_COMPLETE" })
        assertTrue(third.events.any { event -> event.type == "LEAGUE_PROGRESS" })
        assertEquals(third.trainingResult.id, repeatedThird.trainingResult.id)
        assertEquals(emptyList(), repeatedThird.events)
        assertEquals(1, gamificationEventRepo.findByKeycloakSubjectOrderByCreatedAtDesc("calibration-three-subject").count { it.eventType == "CALIBRATION_COMPLETE" })
    }

    @Test
    fun `strong calibration starts above beginner league`() {
        gamificationEventRepo.deleteAllInBatch()
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        gamificationProfileRepo.deleteAllInBatch()

        val auth = keyboardAuthentication(subject = "strong-calibration-subject")
        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id

        trainingController.submit(auth, calibrationRequest(chordSetId, "strong-calibration-1", 300.0).copy(cadence = 0.70))
        trainingController.submit(auth, calibrationRequest(chordSetId, "strong-calibration-2", 320.0).copy(cadence = 0.72))
        val third = trainingController.submit(auth, calibrationRequest(chordSetId, "strong-calibration-3", 340.0).copy(cadence = 0.74))

        assertTrue(assertNotNull(third.gamification.leagueLevel) >= 3)
    }

    @Test
    fun `streak achievements are emitted once when local training dates advance`() {
        gamificationEventRepo.deleteAllInBatch()
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()
        gamificationProfileRepo.deleteAllInBatch()

        val auth = keyboardAuthentication(subject = "streak-subject")
        val chordSetId = chordSetController.list(layout = "EN", difficulty = null)[0].id

        (1..7).forEach { day ->
            trainingController.submit(
                auth,
                calibrationRequest(chordSetId, "streak-result-$day", 205.0).copy(
                    localTrainingDate = "2026-06-${day.toString().padStart(2, '0')}",
                    clientTimezone = "Europe/Moscow",
                ),
            )
        }
        val repeatedSeventh = trainingController.submit(
            auth,
            calibrationRequest(chordSetId, "streak-result-7", 205.0).copy(
                localTrainingDate = "2026-06-07",
                clientTimezone = "Europe/Moscow",
            ),
        )

        val progress = trainingController.progress(auth)
        assertEquals(7, progress.gamification?.currentStreak)
        assertTrue(progress.gamification?.achievements.orEmpty().contains("STREAK_7"))
        assertEquals(emptyList(), repeatedSeventh.events)
        assertEquals(1, gamificationEventRepo.findByKeycloakSubjectOrderByCreatedAtDesc("streak-subject").count { it.payloadJson.contains("STREAK_7") })
    }

    @Test
    fun `liquibase loads corpus chord rows while preserving seed set ids`() {
        val chordSets = chordSetController.list(layout = "EN", difficulty = null) +
            chordSetController.list(layout = "RU", difficulty = null)

        assertEquals((1L..42L).toList(), chordSets.map { it.id }.sorted())
        chordSets.forEach { chordSet ->
            assertTrue(chordSet.chords.size >= 48, "set ${chordSet.id} should have a corpus-sized pool")
            assertEquals(chordSet.chords.size, chordSet.chords.toSet().size, "set ${chordSet.id} should not contain duplicate chords")
        }
        assertTrue(chordSets.first { it.id == 10L }.chords.contains("ation"))
        assertTrue(chordSets.first { it.id == 12L }.chords.contains("аться"))
    }

    @Test
    fun `authenticated severe errors return a focus lesson`() {
        trainingResultRepo.deleteAllInBatch()
        layoutMasteryProfileRepo.deleteAllInBatch()

        val chordSet = chordSetController.list(layout = "EN", difficulty = null)[0]
        val chordSetId = chordSet.id
        val saved = trainingController.submit(
            keyboardAuthentication(),
            SubmitResultRequest(
                chordSetId = chordSetId,
                lessonKind = "STANDARD",
                speedCpm = 120.0,
                accuracy = 0.72,
                errors = 5,
                durationMs = 35_000,
                perFinger = mapOf("leftIndex" to 5),
                perChar = mapOf("t" to 4),
                perChord = mapOf("th" to 3),
            ),
        )

        assertEquals("SEVERE", saved.focusLesson?.reason)
        assertTrue(saved.focusLesson?.problemKeys.orEmpty().contains("th"))
        assertEquals(32, saved.focusLesson?.chords.orEmpty().size)
        assertTrue(
            saved.focusLesson?.chords.orEmpty().any { chord -> chord in chordSet.chords && chord != "th" },
            "focus lesson should mix critical ngrams with supporting source-set chords",
        )
        assertTrue(
            saved.focusLesson?.chords.orEmpty().count { chord -> chord in setOf("th", "ht", "t", "tt", "h", "hh") } <=
                saved.focusLesson?.chords.orEmpty().size / 2,
            "direct critical ngram repeats should not dominate the whole focus lesson",
        )
    }

}
