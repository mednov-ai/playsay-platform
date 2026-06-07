package com.playsay.keyboard

import com.playsay.keyboard.controller.ChordSetController
import com.playsay.keyboard.controller.AnonymousController
import com.playsay.keyboard.controller.MeController
import com.playsay.keyboard.controller.TrainingController
import com.playsay.keyboard.dto.ClaimAnonymousProgressRequest
import com.playsay.keyboard.dto.ResolveAnonymousProfileRequest
import com.playsay.keyboard.dto.SubmitAnonymousResultRequest
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.dto.UpdateAnonymousProfileRequest
import com.playsay.keyboard.repo.AnonymousProfileRepo
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
        assertTrue(saved.focusLesson?.chords.orEmpty().isNotEmpty())
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

        assertEquals("SEVERE", saved.focusLesson?.reason)
        assertTrue(saved.focusLesson?.problemKeys.orEmpty().contains("th"))
    }

    @Test
    fun `anonymous moderate repeated errors return focus after three sessions`() {
        trainingResultRepo.deleteAllInBatch()
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
    fun `authenticated user can claim anonymous progress once`() {
        trainingResultRepo.deleteAllInBatch()
        anonymousProfileRepo.deleteAllInBatch()

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

    private fun anonymousRequest(): MockHttpServletRequest =
        MockHttpServletRequest().apply {
            remoteAddr = "203.0.113.42"
            addHeader("User-Agent", "KeyboardApiTest")
            addHeader("X-Forwarded-For", "203.0.113.42")
        }
}
