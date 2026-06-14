package com.playsay.keyboard

import com.playsay.keyboard.controller.ChordSetController
import com.playsay.keyboard.controller.AnonymousController
import com.playsay.keyboard.controller.MeController
import com.playsay.keyboard.controller.TrainingController
import com.playsay.keyboard.dto.ClaimAnonymousProgressRequest
import com.playsay.keyboard.dto.ResolveAnonymousProfileRequest
import com.playsay.keyboard.dto.ResetAnonymousProfileRequest
import com.playsay.keyboard.dto.SubmitAnonymousResultRequest
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.dto.UpdateAnonymousProfileRequest
import com.playsay.keyboard.repo.AnonymousProfileRepo
import com.playsay.keyboard.repo.GamificationEventRepo
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import com.playsay.keyboard.repo.TrainingResultRepo
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
class KeyboardApiTest @Autowired constructor(
    private val anonymousController: AnonymousController,
    private val chordSetController: ChordSetController,
    private val trainingController: TrainingController,
    private val meController: MeController,
    private val anonymousProfileRepo: AnonymousProfileRepo,
    private val gamificationEventRepo: GamificationEventRepo,
    private val gamificationProfileRepo: GamificationProfileRepo,
    private val layoutMasteryProfileRepo: LayoutMasteryProfileRepo,
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

        assertEquals((1L..12L).toList(), chordSets.map { it.id }.sorted())
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

    private fun calibrationRequest(chordSetId: Long, clientResultId: String, averageCpm: Double): SubmitResultRequest =
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

    private fun keyboardAuthentication(
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

    private fun anonymousRequest(): MockHttpServletRequest =
        MockHttpServletRequest().apply {
            remoteAddr = "203.0.113.42"
            addHeader("User-Agent", "KeyboardApiTest")
            addHeader("X-Forwarded-For", "203.0.113.42")
        }
}
