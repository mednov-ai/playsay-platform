package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeMode
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyAttemptRequest
import com.playsay.vocabulary.dto.VocabularyHomeworkPreparationRequest
import com.playsay.vocabulary.dto.VocabularyKeyResultRequest
import com.playsay.vocabulary.dto.VocabularyKeyWordAttemptRequest
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularyUserProjection
import com.playsay.vocabulary.realtime.VocabularyPracticeChangedEvent
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyIntegrationOutboxRepo
import com.playsay.vocabulary.repo.VocabularyPracticeAttemptRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import com.playsay.vocabulary.repo.VocabularyUserRepo
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.test.context.event.ApplicationEvents
import org.springframework.test.context.event.RecordApplicationEvents

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:vocabulary-characterization;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.liquibase.enabled=false",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost/unused-jwks",
    ],
)
@RecordApplicationEvents
class VocabularyPracticeCharacterizationTest @Autowired constructor(
    private val practice: VocabularyPracticeService,
    private val entries: VocabularyEntryRepo,
    private val users: VocabularyUserRepo,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
    private val integrationOutbox: VocabularyIntegrationOutboxRepo,
    private val objectMapper: ObjectMapper,
    private val assignmentProgress: VocabularyAssignmentProgressOutbox,
) {
    @Autowired
    private lateinit var applicationEvents: ApplicationEvents

    @TestConfiguration(proxyBeanMethods = false)
    class CharacterizationConfig {
        @Bean
        @Primary
        fun characterizationAccess(): VocabularyAccessService =
            Mockito.mock(VocabularyAccessService::class.java) { invocation ->
                when (invocation.method.name) {
                    "requireOwnerAccess", "requireLessonOwnerAccess" -> invocation.arguments[1]
                    else -> Mockito.RETURNS_DEFAULTS.answer(invocation)
                }
            }

        @Bean
        @Primary
        fun characterizationAssignmentProgress(): VocabularyAssignmentProgressOutbox =
            Mockito.mock(VocabularyAssignmentProgressOutbox::class.java)
    }

    @BeforeEach
    fun resetAssignmentProgressMock() {
        Mockito.reset(assignmentProgress)
    }

    @Test
    fun `dashboard query self practice and history keep the current read shapes`() {
        val owner = seedOwner("self")
        seedEntry(owner, "steady", "устойчивый")
        seedEntry(owner, "bright", null)

        val dashboard = practice.dashboard(owner, owner, null, "STEAD")
        val created = practice.selfPractice(
            owner,
            VocabularyPracticeSettingsRequest(mode = PracticeMode.QUICK, wordLimit = 1),
        )
        val repeated = practice.selfPractice(
            owner,
            VocabularyPracticeSettingsRequest(mode = PracticeMode.QUICK, wordLimit = 1),
        )
        val history = practice.history(owner, owner, null)

        assertEquals(2, dashboard.totalCount)
        assertEquals(1, dashboard.needsTranslationCount)
        assertEquals(listOf("steady"), dashboard.entries.map { it.entry.sourceText })
        assertEquals(PracticeDelivery.SELF, created.delivery)
        assertEquals(PracticeStatus.ACTIVE, created.status)
        assertEquals(created.id, repeated.id)
        assertEquals(created.sessions.single().id, history.single().id)
        assertEquals(PracticeMode.QUICK, history.single().mode)
    }

    @Test
    fun `live and homework creation preserve delivery status and idempotency`() {
        val teacher = seedOwner("teacher")
        val learner = seedOwner("learner")
        seedEntry(learner, "steady", "устойчивый")
        val lessonId = UUID.randomUUID()

        val live = practice.createLive(
            teacher,
            VocabularyPracticeSettingsRequest(
                ownerSubjects = listOf(learner),
                delivery = PracticeDelivery.LIVE,
                lessonId = lessonId,
                wordLimit = 1,
            ),
        )
        val assignmentId = UUID.randomUUID()
        val homework = practice.prepareHomework(
            VocabularyHomeworkPreparationRequest(
                actorSubject = teacher,
                assignmentId = assignmentId,
                ownerSubjects = listOf(learner),
                wordLimit = 1,
            ),
        )
        val repeatedHomework = practice.prepareHomework(
            VocabularyHomeworkPreparationRequest(
                actorSubject = teacher,
                assignmentId = assignmentId,
                ownerSubjects = listOf(learner),
                wordLimit = 1,
            ),
        )

        assertEquals(PracticeDelivery.LIVE, live.delivery)
        assertEquals(PracticeStatus.ACTIVE, live.status)
        assertEquals(lessonId, live.lessonId)
        assertEquals(learner, live.sessions.single().ownerSubject)
        assertEquals(homework.practiceId, repeatedHomework.practiceId)
        assertEquals(PracticeDelivery.HOMEWORK, practices.findById(homework.practiceId).orElseThrow().delivery)
        assertEquals(PracticeStatus.PUBLISHED, practices.findById(homework.practiceId).orElseThrow().status)
    }

    @Test
    fun `attempt reveal realtime and assignment progress preserve revision and idempotency`() {
        val owner = seedOwner("attempt")
        val seeded = seedPractice(
            creator = owner,
            owner = owner,
            delivery = PracticeDelivery.HOMEWORK,
            exerciseType = PracticeExerciseType.FLASHCARD,
            assignmentId = UUID.randomUUID(),
        )

        assertEquals("steady", practice.reveal(owner, seeded.session.id, seeded.item.id).expectedAnswer)
        val first = practice.attempt(
            owner,
            seeded.session.id,
            VocabularyAttemptRequest(
                clientAttemptId = "attempt-1",
                itemId = seeded.item.id,
                sessionRevision = 0,
                rating = PracticeRating.GOOD,
            ),
        )
        assertEquals(1, attempts.findAllBySessionIdOrderByCreatedAtAsc(seeded.session.id).size)
        assertEquals(1, first.session.revision)
        assertEquals(SessionStatus.COMPLETED, first.session.status)
        val enqueue = assignmentProgressEnqueues().single()
        assertEquals(seeded.practice.assignmentId, enqueue.arguments[0])
        assertEquals(seeded.session.id, (enqueue.arguments[1] as VocabularyPracticeSessionEntity).id)
        assertEquals(listOf(1, 1, 0), enqueue.arguments.drop(2))
        assertTrue(practiceEvents().any { it.type == "vocabulary.attempt.recorded" && it.sessionId == seeded.session.id })
    }

    @Test
    fun `live help and teacher hint publish session updates without exposing the answer`() {
        val teacher = seedOwner("teacher-hint")
        val learner = seedOwner("learner-help")
        val seeded = seedPractice(
            creator = teacher,
            owner = learner,
            delivery = PracticeDelivery.LIVE,
            exerciseType = PracticeExerciseType.FLASHCARD,
        )

        val help = practice.requestHelp(learner, seeded.session.id)
        val hinted = practice.giveHint(teacher, seeded.session.id)

        assertTrue(help.helpRequested)
        assertEquals(1, help.revision)
        assertFalse(hinted.helpRequested)
        assertEquals(2, hinted.revision)
        assertNotNull(hinted.teacherHint)
        assertNotEquals("steady", hinted.teacherHint)
        assertEquals(2, practiceEvents().count { it.type == "vocabulary.session.updated" })
    }

    @Test
    fun `keyboard result records one spelling attempt and publishes once`() {
        val owner = seedOwner("keyboard")
        val assignmentId = UUID.randomUUID()
        val seeded = seedPractice(
            creator = owner,
            owner = owner,
            delivery = PracticeDelivery.HOMEWORK,
            exerciseType = PracticeExerciseType.KEYBOARD,
            skill = VocabularySkill.SPELLING,
            assignmentId = assignmentId,
        )
        val request = VocabularyKeyResultRequest(
            clientResultId = "keyboard-result-1",
            attempts = listOf(VocabularyKeyWordAttemptRequest(seeded.item.id, seeded.entry.id, errors = 0)),
        )

        val keySet = practice.keySet(owner, seeded.session.id)
        practice.recordKeyResult(seeded.session.id, request)
        practice.recordKeyResult(seeded.session.id, request)

        assertEquals(listOf(seeded.item.id), keySet.items.map { it.itemId })
        assertEquals(1, attempts.findAllBySessionIdOrderByCreatedAtAsc(seeded.session.id).size)
        assertEquals(1, sessions.findById(seeded.session.id).orElseThrow().revision)
        assertEquals(SessionStatus.COMPLETED, sessions.findById(seeded.session.id).orElseThrow().status)
        val enqueue = assignmentProgressEnqueues().single()
        assertEquals(assignmentId, enqueue.arguments[0])
        assertEquals(seeded.session.id, (enqueue.arguments[1] as VocabularyPracticeSessionEntity).id)
        assertEquals(listOf(1, 1, 0), enqueue.arguments.drop(2))
        assertEquals(1, practiceEvents().count { it.type == "vocabulary.attempt.recorded" })
    }

    @Test
    fun `assignment progress outbox keeps payload state and session revision idempotency`() {
        val owner = seedOwner("outbox")
        val seeded = seedPractice(owner, owner, PracticeDelivery.HOMEWORK, PracticeExerciseType.FLASHCARD)
        seeded.session.status = SessionStatus.IN_PROGRESS
        seeded.session.revision = 3
        seeded.session.attemptCount = 2
        seeded.session.correctCount = 1
        seeded.session.updatedAt = Instant.parse("2026-08-20T10:00:00Z")
        sessions.save(seeded.session)
        val realOutbox = VocabularyAssignmentProgressOutbox(
            integrationOutbox,
            objectMapper,
            "http://127.0.0.1:1",
            "test-token",
        )
        val assignmentId = UUID.randomUUID()

        realOutbox.enqueue(assignmentId, seeded.session, completedItems = 1, totalItems = 2, difficultWordCount = 1)
        realOutbox.enqueue(assignmentId, seeded.session, completedItems = 1, totalItems = 2, difficultWordCount = 1)

        val stored = integrationOutbox.findAll().single()
        val payload = objectMapper.readValue(stored.payload, VocabularyAssignmentProgressPayload::class.java)
        assertEquals(3, stored.sessionRevision)
        assertEquals("PENDING", stored.status)
        assertEquals("IN_PROGRESS", payload.state)
        assertEquals(0.5, payload.completionRatio)
        assertEquals(0.5, payload.accuracy)
        assertEquals(1, payload.difficultWordCount)
    }

    private fun seedOwner(label: String): String {
        val subject = "$label-${UUID.randomUUID()}"
        users.save(
            VocabularyUserProjection(
                id = UUID.randomUUID(),
                keycloakSubject = subject,
                username = label,
                displayName = "$label learner",
            ),
        )
        return subject
    }

    private fun seedEntry(owner: String, source: String, translation: String?): VocabularyEntryEntity =
        entries.save(
            VocabularyEntryEntity(
                ownerSubject = owner,
                sourceText = source,
                normalizedSource = source,
                translation = translation,
                createdBySubject = owner,
                createdAt = Instant.parse("2026-08-20T09:00:00Z"),
                updatedAt = Instant.parse("2026-08-20T09:00:00Z"),
            ),
        )

    private fun seedPractice(
        creator: String,
        owner: String,
        delivery: PracticeDelivery,
        exerciseType: PracticeExerciseType,
        skill: VocabularySkill = VocabularySkill.MEANING,
        assignmentId: UUID? = null,
    ): SeededPractice {
        val now = Instant.parse("2026-08-20T09:00:00Z")
        val entry = seedEntry(owner, "steady", "устойчивый")
        val practiceEntity = practices.save(
            VocabularyPracticeEntity(
                createdBySubject = creator,
                delivery = delivery,
                status = if (delivery == PracticeDelivery.HOMEWORK) PracticeStatus.PUBLISHED else PracticeStatus.ACTIVE,
                assignmentId = assignmentId,
                mode = if (exerciseType == PracticeExerciseType.KEYBOARD) PracticeMode.KEYBOARD else PracticeMode.BALANCED,
                createdAt = now,
                updatedAt = now,
            ),
        )
        val session = sessions.save(
            VocabularyPracticeSessionEntity(
                practiceId = practiceEntity.id,
                ownerSubject = owner,
                status = SessionStatus.NOT_STARTED,
                createdAt = now,
                updatedAt = now,
            ),
        )
        val item = items.save(
            VocabularyPracticeItemEntity(
                sessionId = session.id,
                entryId = entry.id,
                position = 0,
                skill = skill,
                exerciseType = exerciseType,
                prompt = "Translate",
                answer = "steady",
                snapshotJson = objectMapper.writeValueAsString(mapOf("sourceText" to "steady", "translation" to "устойчивый")),
                createdAt = now,
                updatedAt = now,
            ),
        )
        return SeededPractice(practiceEntity, session, item, entry)
    }

    private fun practiceEvents(): List<VocabularyPracticeChangedEvent> =
        applicationEvents.stream(VocabularyPracticeChangedEvent::class.java).toList()

    private fun assignmentProgressEnqueues() =
        Mockito.mockingDetails(assignmentProgress).invocations.filter { it.method.name == "enqueue" }

    private data class SeededPractice(
        val practice: VocabularyPracticeEntity,
        val session: VocabularyPracticeSessionEntity,
        val item: VocabularyPracticeItemEntity,
        val entry: VocabularyEntryEntity,
    )
}
