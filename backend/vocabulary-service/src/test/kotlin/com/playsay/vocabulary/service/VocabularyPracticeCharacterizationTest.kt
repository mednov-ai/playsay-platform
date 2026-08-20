package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.CreateVocabularyEntryRequest
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeMode
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyAttemptRequest
import com.playsay.vocabulary.dto.VocabularyHomeworkPreparationRequest
import com.playsay.vocabulary.dto.VocabularyKeyResultRequest
import com.playsay.vocabulary.dto.VocabularyKeyAcknowledgementRequest
import com.playsay.vocabulary.dto.VocabularyKeyWordAttemptRequest
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.dto.VocabularyPracticeStatusRequest
import com.playsay.vocabulary.dto.VocabularySourceType
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularyUserProjection
import com.playsay.vocabulary.realtime.VocabularyPracticeChangedEvent
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyIntegrationOutboxRepo
import com.playsay.vocabulary.repo.VocabularyOccurrenceRepo
import com.playsay.vocabulary.repo.VocabularyLexicalContentRevisionRepo
import com.playsay.vocabulary.repo.VocabularyLexicalSenseRepo
import com.playsay.vocabulary.repo.VocabularyLearningEvidenceRepo
import com.playsay.vocabulary.repo.VocabularyProjectionQueueRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
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
import io.micrometer.core.instrument.MeterRegistry

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
    private val vocabulary: VocabularyService,
    private val entries: VocabularyEntryRepo,
    private val occurrences: VocabularyOccurrenceRepo,
    private val lexicalSenses: VocabularyLexicalSenseRepo,
    private val lexicalRevisions: VocabularyLexicalContentRevisionRepo,
    private val lexicalBackfill: VocabularyLexicalBackfillService,
    private val users: VocabularyUserRepo,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
    private val learningEvidence: VocabularyLearningEvidenceRepo,
    private val keyResults: com.playsay.vocabulary.repo.VocabularyKeyResultRepo,
    private val projectionQueue: VocabularyProjectionQueueRepo,
    private val skillStates: VocabularySkillStateRepo,
    private val integrationOutbox: VocabularyIntegrationOutboxRepo,
    private val objectMapper: ObjectMapper,
    private val assignmentProgress: VocabularyAssignmentProgressOutbox,
    private val meters: MeterRegistry,
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
    fun `normalized duplicate entry appends an occurrence instead of creating a second entry`() {
        val owner = seedOwner("occurrence")
        val firstLesson = UUID.randomUUID()
        val secondLesson = UUID.randomUUID()

        val first = vocabulary.create(
            owner,
            CreateVocabularyEntryRequest(
                sourceText = "  Steady  ",
                translation = "устойчивый",
                sourceType = VocabularySourceType.LESSON,
                lessonId = firstLesson,
            ),
        )
        val repeated = vocabulary.create(
            owner,
            CreateVocabularyEntryRequest(
                sourceText = "steady",
                translation = "устойчивый",
                sourceType = VocabularySourceType.LESSON,
                lessonId = secondLesson,
            ),
        )

        assertEquals(first.id, repeated.id)
        assertEquals(1, entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(owner, com.playsay.vocabulary.dto.EntryStatus.ACTIVE).size)
        assertEquals(2, occurrences.findAll().count { it.entry?.id == first.id })
        assertEquals(setOf(firstLesson, secondLesson), repeated.occurrences.mapNotNull { it.lessonId }.toSet())
    }

    @Test
    fun `same spelling with different meanings creates separate learner senses`() {
        val owner = seedOwner("homograph")

        val financial = vocabulary.create(
            owner,
            CreateVocabularyEntryRequest(sourceText = "bank", translation = "банк"),
        )
        val riverside = vocabulary.create(
            owner,
            CreateVocabularyEntryRequest(sourceText = "bank", translation = "берег реки"),
        )

        assertNotEquals(financial.id, riverside.id)
        val stored = entries.findAllByOwnerSubjectAndNormalizedSourceAndSourceLanguageAndTargetLanguageOrderByUpdatedAtDesc(
            owner,
            "bank",
            "en",
            "ru",
        )
        assertEquals(2, stored.size)
        assertEquals(2, stored.mapNotNull { it.lexicalSenseId }.distinct().size)
    }

    @Test
    fun `learner lexical senses and private occurrence context do not cross owner boundaries`() {
        val firstOwner = seedOwner("sense-owner-a")
        val secondOwner = seedOwner("sense-owner-b")
        val privateContext = "private lesson note for one learner"
        val lessonId = UUID.randomUUID()
        val materialId = UUID.randomUUID()
        val courseId = UUID.randomUUID()

        val first = vocabulary.create(
            firstOwner,
            CreateVocabularyEntryRequest(
                sourceText = "steady",
                translation = "устойчивый",
                sourceType = VocabularySourceType.LESSON,
                lessonId = lessonId,
                materialId = materialId,
                courseId = courseId,
                blockId = "word-block",
                sourceRevision = "material-revision-3",
                context = privateContext,
            ),
        )
        val second = vocabulary.create(
            secondOwner,
            CreateVocabularyEntryRequest(sourceText = "steady", translation = "устойчивый"),
        )
        val firstEntity = entries.findById(first.id).orElseThrow()
        val secondEntity = entries.findById(second.id).orElseThrow()
        val firstSense = lexicalSenses.findById(requireNotNull(firstEntity.lexicalSenseId)).orElseThrow()
        val firstContent = lexicalRevisions.findById(requireNotNull(firstEntity.lexicalContentRevisionId)).orElseThrow()

        assertNotEquals(firstEntity.lexicalSenseId, secondEntity.lexicalSenseId)
        assertNotEquals(firstSense.scopeKey, lexicalSenses.findById(requireNotNull(secondEntity.lexicalSenseId)).orElseThrow().scopeKey)
        assertFalse(firstSense.normalizedMeaning.contains(privateContext))
        assertFalse(firstContent.acceptedAnswersJson.contains(privateContext))
        assertEquals(privateContext, first.occurrences.single().context)
        val storedOccurrence = occurrences.findAll().single { it.entry?.id == first.id }
        assertEquals(firstOwner, storedOccurrence.addedBySubject)
        assertEquals(lessonId, storedOccurrence.lessonId)
        assertEquals(materialId, storedOccurrence.materialId)
        assertEquals(courseId, storedOccurrence.courseId)
        assertEquals("word-block", storedOccurrence.blockId)
        assertEquals("material-revision-3", storedOccurrence.sourceRevision)
        assertNotNull(storedOccurrence.createdAt)
    }

    @Test
    fun `changed reviewed lexical content creates a new revision while retaining the entry`() {
        val owner = seedOwner("content-revision")
        val first = vocabulary.create(
            owner,
            CreateVocabularyEntryRequest(sourceText = "steady", translation = "устойчивый", example = "Keep a steady pace."),
        )
        val firstEntity = entries.findById(first.id).orElseThrow()
        val senseId = requireNotNull(firstEntity.lexicalSenseId)
        val firstRevisionId = requireNotNull(firstEntity.lexicalContentRevisionId)

        val updated = vocabulary.create(
            owner,
            CreateVocabularyEntryRequest(sourceText = "steady", translation = "устойчивый", example = "She made steady progress."),
        )
        val updatedEntity = entries.findById(updated.id).orElseThrow()
        val revisions = lexicalRevisions.findAllBySenseIdOrderByRevisionAsc(senseId)

        assertEquals(first.id, updated.id)
        assertEquals(2, revisions.size)
        assertEquals(firstRevisionId, revisions.first().id)
        assertNotEquals(firstRevisionId, updatedEntity.lexicalContentRevisionId)
        assertEquals("SUPERSEDED", revisions.first().status.name)
        assertEquals("ACTIVE", revisions.last().status.name)
    }

    @Test
    fun `entries without meaning stay private and unresolved while repeated occurrences still deduplicate`() {
        val owner = seedOwner("unresolved")

        val first = vocabulary.create(owner, CreateVocabularyEntryRequest(sourceText = "unclear"))
        val repeated = vocabulary.create(owner, CreateVocabularyEntryRequest(sourceText = "  UNCLEAR "))
        val stored = entries.findById(first.id).orElseThrow()

        assertEquals(first.id, repeated.id)
        assertEquals(2, repeated.occurrences.size)
        assertEquals(null, stored.lexicalSenseId)
        assertEquals(null, stored.lexicalContentRevisionId)
    }

    @Test
    fun `lexical backfill links only unambiguous legacy entries and is idempotent`() {
        val clearOwner = seedOwner("backfill-clear")
        val ambiguousOwner = seedOwner("backfill-ambiguous")
        val clear = seedEntry(clearOwner, "steady", "устойчивый")
        val firstBank = seedEntry(ambiguousOwner, "bank", "банк")
        val secondBank = entries.save(
            VocabularyEntryEntity(
                ownerSubject = ambiguousOwner,
                sourceText = "bank",
                normalizedSource = "bank",
                translation = "берег реки",
                createdBySubject = ambiguousOwner,
                createdAt = Instant.parse("2026-08-20T09:00:00Z"),
                updatedAt = Instant.parse("2026-08-20T09:00:00Z"),
            ),
        )

        val firstRun = lexicalBackfill.backfill()
        val repeatedRun = lexicalBackfill.backfill()

        assertTrue(clear.id in firstRun.linkedEntryIds)
        assertTrue(firstBank.id in firstRun.skippedAmbiguousEntryIds)
        assertTrue(secondBank.id in firstRun.skippedAmbiguousEntryIds)
        assertNotNull(entries.findById(clear.id).orElseThrow().lexicalSenseId)
        assertEquals(null, entries.findById(firstBank.id).orElseThrow().lexicalSenseId)
        assertEquals(null, entries.findById(secondBank.id).orElseThrow().lexicalSenseId)
        assertTrue(repeatedRun.linkedEntryIds.isEmpty())
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
        val reconnectedLive = practice.status(teacher, live.id, VocabularyPracticeStatusRequest(PracticeStatus.ACTIVE))

        assertEquals(PracticeDelivery.LIVE, live.delivery)
        assertEquals(PracticeStatus.ACTIVE, live.status)
        assertEquals(lessonId, live.lessonId)
        assertEquals(learner, live.sessions.single().ownerSubject)
        assertEquals(live.sessions.single().revision, reconnectedLive.sessions.single().revision)
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
        assertEquals("steady", practice.reveal(owner, seeded.session.id, seeded.item.id).expectedAnswer)
        assertEquals(1, learningEvidence.findAllBySessionIdOrderByOccurredAtAsc(seeded.session.id).size)
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
        assertEquals(2, learningEvidence.findAllBySessionIdOrderByOccurredAtAsc(seeded.session.id).size)
        assertEquals("COMPLETED", projectionQueue.findAll().single { it.entryId == seeded.entry.id }.status)
        assertNotNull(skillStates.findByEntryIdAndSkill(seeded.entry.id, VocabularySkill.MEANING)?.evidenceWatermark)
        assertEquals(1, first.session.revision)
        assertEquals(SessionStatus.COMPLETED, first.session.status)
        val enqueue = assignmentProgressEnqueues().single()
        assertEquals(seeded.practice.assignmentId, enqueue.arguments[0])
        assertEquals(seeded.session.id, (enqueue.arguments[1] as VocabularyPracticeSessionEntity).id)
        val evaluation = enqueue.arguments[2] as VocabularyHomeworkProgressEvaluation
        assertEquals("COMPLETED", evaluation.state)
        assertEquals(0, evaluation.distinctGradedPrompts)
        assertTrue(practiceEvents().any { it.type == "vocabulary.attempt.recorded" && it.sessionId == seeded.session.id })
    }

    @Test
    fun `failed retrieval stores correction evidence and returns the item for proof retry`() {
        val owner = seedOwner("correction-proof")
        val seeded = seedPractice(
            creator = owner,
            owner = owner,
            delivery = PracticeDelivery.SELF,
            exerciseType = PracticeExerciseType.FORM_INPUT,
            skill = VocabularySkill.FORM,
        )

        val failed = practice.attempt(
            owner,
            seeded.session.id,
            VocabularyAttemptRequest(
                clientAttemptId = "wrong-1",
                itemId = seeded.item.id,
                sessionRevision = 0,
                answer = "stedy",
            ),
        )

        assertEquals(PracticeRating.AGAIN, failed.rating)
        assertEquals(SessionStatus.IN_PROGRESS, failed.session.status)
        assertEquals(seeded.item.id, failed.session.currentItem?.id)
        assertEquals(
            setOf("RETRIEVAL", "CORRECTION"),
            learningEvidence.findAllBySessionIdOrderByOccurredAtAsc(seeded.session.id).map { it.evidenceType.name }.toSet(),
        )

        val corrected = practice.attempt(
            owner,
            seeded.session.id,
            VocabularyAttemptRequest(
                clientAttemptId = "proof-1",
                itemId = seeded.item.id,
                sessionRevision = 1,
                answer = "steady",
            ),
        )
        assertEquals(PracticeRating.GOOD, corrected.rating)
        assertEquals(SessionStatus.COMPLETED, corrected.session.status)
    }

    @Test
    fun `repeating an accepted attempt while the session is open returns the original result`() {
        val owner = seedOwner("attempt-retry")
        val seeded = seedPractice(
            creator = owner,
            owner = owner,
            delivery = PracticeDelivery.SELF,
            exerciseType = PracticeExerciseType.FLASHCARD,
        )
        items.save(
            VocabularyPracticeItemEntity(
                sessionId = seeded.session.id,
                entryId = seeded.entry.id,
                position = 1,
                skill = VocabularySkill.FORM,
                exerciseType = PracticeExerciseType.FORM_INPUT,
                prompt = "Write the word",
                answer = "steady",
                snapshotJson = objectMapper.writeValueAsString(mapOf("sourceText" to "steady", "translation" to "устойчивый")),
                createdAt = Instant.parse("2026-08-20T09:00:00Z"),
                updatedAt = Instant.parse("2026-08-20T09:00:00Z"),
            ),
        )
        val request = VocabularyAttemptRequest(
            clientAttemptId = "attempt-retry-1",
            itemId = seeded.item.id,
            sessionRevision = 0,
            rating = PracticeRating.GOOD,
        )

        val first = practice.attempt(owner, seeded.session.id, request)
        val repeated = practice.attempt(owner, seeded.session.id, request)

        assertEquals(first.attemptId, repeated.attemptId)
        assertEquals(1, attempts.findAllBySessionIdOrderByCreatedAtAsc(seeded.session.id).size)
        assertEquals(1, learningEvidence.findAllBySessionIdOrderByOccurredAtAsc(seeded.session.id).size)
        assertEquals(1, sessions.findById(seeded.session.id).orElseThrow().revision)
        assertEquals(SessionStatus.IN_PROGRESS, sessions.findById(seeded.session.id).orElseThrow().status)
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
    fun `lesson closure continuation clones only unfinished immutable items and preserves accepted live attempts`() {
        val teacher = seedOwner("teacher-continuation")
        val learner = seedOwner("learner-continuation")
        val seeded = seedPractice(teacher, learner, PracticeDelivery.LIVE, PracticeExerciseType.FORM_INPUT)
        val now = Instant.now()
        seeded.practice.status = PracticeStatus.COMPLETED
        seeded.practice.completedAt = now
        practices.save(seeded.practice)
        seeded.item.completedAt = now
        items.save(seeded.item)
        attempts.save(
            com.playsay.vocabulary.entity.VocabularyPracticeAttemptEntity(
                sessionId = seeded.session.id,
                itemId = seeded.item.id,
                ownerSubject = learner,
                clientAttemptId = "accepted-live-attempt",
                correct = true,
                rating = PracticeRating.GOOD,
            ),
        )
        items.save(
            VocabularyPracticeItemEntity(
                sessionId = seeded.session.id,
                entryId = seeded.entry.id,
                position = 1,
                skill = VocabularySkill.FORM,
                exerciseType = PracticeExerciseType.FORM_INPUT,
                prompt = "unfinished immutable prompt",
                answer = "steady",
                snapshotJson = """{"contentRevision":"frozen-1"}""",
            ),
        )

        val continuation = practice.prepareHomework(
            VocabularyHomeworkPreparationRequest(
                actorSubject = teacher,
                assignmentId = UUID.randomUUID(),
                ownerSubjects = listOf(learner),
                sourcePracticeId = seeded.practice.id,
            ),
        )
        val continuationSession = sessions.findByPracticeIdAndOwnerSubject(continuation.practiceId, learner)!!
        val cloned = items.findAllBySessionIdOrderByPositionAsc(continuationSession.id)

        assertEquals(listOf("unfinished immutable prompt"), cloned.map { it.prompt })
        assertEquals("""{"contentRevision":"frozen-1"}""", cloned.single().snapshotJson)
        assertEquals(1, attempts.findAllBySessionIdOrderByCreatedAtAsc(seeded.session.id).size)
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
        assertEquals("KEY_TARGET", learningEvidence.findAllBySessionIdOrderByOccurredAtAsc(seeded.session.id).single().evidenceType.name)
        assertEquals(1, sessions.findById(seeded.session.id).orElseThrow().revision)
        assertEquals(SessionStatus.COMPLETED, sessions.findById(seeded.session.id).orElseThrow().status)
        val enqueue = assignmentProgressEnqueues().single()
        assertEquals(assignmentId, enqueue.arguments[0])
        assertEquals(seeded.session.id, (enqueue.arguments[1] as VocabularyPracticeSessionEntity).id)
        val evaluation = enqueue.arguments[2] as VocabularyHomeworkProgressEvaluation
        assertEquals("COMPLETED", evaluation.state)
        assertEquals(1, evaluation.distinctGradedPrompts)
        assertEquals(1, practiceEvents().count { it.type == "vocabulary.attempt.recorded" })
    }

    @Test
    fun `typed ngram results are idempotent activity evidence and never spelling schedule credit`() {
        val owner = seedOwner("keyboard-ngram")
        val seeded = seedPractice(
            creator = owner,
            owner = owner,
            delivery = PracticeDelivery.HOMEWORK,
            exerciseType = PracticeExerciseType.KEYBOARD,
            skill = VocabularySkill.SPELLING,
            assignmentId = UUID.randomUUID(),
        )
        seeded.practice.keyMode = com.playsay.vocabulary.dto.VocabularyKeyMode.CHARACTER_NGRAMS
        seeded.practice.keyMaterializerSeed = 21
        seeded.practice.keyNgramSettingsJson = """{"minLength":3,"maxLength":3,"targetLimit":4,"maxRepetitions":1}"""
        practices.save(seeded.practice)
        val keySet = practice.keySet(owner, seeded.session.id)
        val request = VocabularyKeyResultRequest(
            clientResultId = "keyboard-ngram-result-1",
            attempts = keySet.targets.map { target ->
                VocabularyKeyWordAttemptRequest(
                    itemId = seeded.item.id,
                    entryId = seeded.entry.id,
                    errors = 0,
                    resultId = UUID.nameUUIDFromBytes("result-${target.targetId}".toByteArray()),
                    targetId = target.targetId,
                    targetType = target.type,
                    durationMs = 250,
                    position = target.position,
                    typedText = target.text,
                    sourceEntryIds = target.sourceEntryIds,
                    sourceItemIds = target.sourceItemIds,
                )
            },
        )

        practice.recordKeyResult(seeded.session.id, request)
        practice.recordKeyResult(seeded.session.id, request)

        assertTrue(keySet.targets.isNotEmpty())
        assertTrue(keySet.targets.all { it.type == com.playsay.vocabulary.dto.VocabularyKeyTargetType.CHARACTER_NGRAM })
        assertEquals(keySet.targets.size, keyResults.findAllBySessionIdOrderByPositionAsc(seeded.session.id).size)
        assertEquals(0, attempts.findAllBySessionIdOrderByCreatedAtAsc(seeded.session.id).size)
        assertTrue(learningEvidence.findAllBySessionIdOrderByOccurredAtAsc(seeded.session.id).all { it.skill == null })
        assertEquals(SessionStatus.COMPLETED, sessions.findById(seeded.session.id).orElseThrow().status)
    }

    @Test
    fun `typed key snapshots resume idempotently across self live and every homework policy`() {
        val modes = com.playsay.vocabulary.dto.VocabularyKeyMode.entries
        val policies = com.playsay.vocabulary.dto.VocabularyHomeworkCompletionPolicy.entries
        PracticeDelivery.entries.forEach { delivery ->
            val deliveryPolicies = if (delivery == PracticeDelivery.HOMEWORK) policies else listOf(com.playsay.vocabulary.dto.VocabularyHomeworkCompletionPolicy.COMPLETE_SESSION)
            deliveryPolicies.forEach { policy ->
                modes.forEach { keyMode ->
                    val owner = seedOwner("matrix-${delivery.name}-${policy.name}-${keyMode.name}")
                    val assignmentId = UUID.randomUUID().takeIf { delivery == PracticeDelivery.HOMEWORK }
                    val seeded = seedPractice(owner, owner, delivery, PracticeExerciseType.KEYBOARD, VocabularySkill.SPELLING, assignmentId)
                    seeded.practice.keyMode = keyMode
                    seeded.practice.completionPolicy = policy
                    seeded.practice.keyMaterializerSeed = 44
                    seeded.practice.keyNgramSettingsJson = """{"minLength":3,"maxLength":3,"targetLimit":3,"maxRepetitions":1}"""
                    practices.save(seeded.practice)
                    val firstSnapshot = practice.keySet(owner, seeded.session.id)
                    val resumedSnapshot = practice.keySet(owner, seeded.session.id)
                    assertEquals(firstSnapshot.targets, resumedSnapshot.targets)
                    val result = VocabularyKeyResultRequest(
                        clientResultId = "matrix-${seeded.session.id}",
                        attempts = firstSnapshot.targets.map { target ->
                            VocabularyKeyWordAttemptRequest(
                                itemId = seeded.item.id,
                                entryId = seeded.entry.id,
                                errors = 0,
                                resultId = UUID.nameUUIDFromBytes("matrix-${target.targetId}".toByteArray()),
                                targetId = target.targetId,
                                targetType = target.type,
                                position = target.position,
                                typedText = target.text,
                                sourceEntryIds = target.sourceEntryIds,
                                sourceItemIds = target.sourceItemIds,
                            )
                        },
                    )
                    practice.recordKeyResult(seeded.session.id, result)
                    practice.recordKeyResult(seeded.session.id, result)
                    assertEquals(SessionStatus.COMPLETED, sessions.findById(seeded.session.id).orElseThrow().status)
                    assertEquals(firstSnapshot.targets.size, keyResults.findAllBySessionIdOrderByPositionAsc(seeded.session.id).size)
                    assertEquals(
                        when (keyMode) {
                            com.playsay.vocabulary.dto.VocabularyKeyMode.WHOLE_WORDS -> setOf(com.playsay.vocabulary.dto.VocabularyKeyTargetType.WHOLE_WORD)
                            com.playsay.vocabulary.dto.VocabularyKeyMode.CHARACTER_NGRAMS -> setOf(com.playsay.vocabulary.dto.VocabularyKeyTargetType.CHARACTER_NGRAM)
                            com.playsay.vocabulary.dto.VocabularyKeyMode.MIXED -> setOf(com.playsay.vocabulary.dto.VocabularyKeyTargetType.WHOLE_WORD, com.playsay.vocabulary.dto.VocabularyKeyTargetType.CHARACTER_NGRAM)
                        },
                        firstSnapshot.targets.map { it.type }.toSet(),
                    )
                    if (delivery == PracticeDelivery.HOMEWORK) {
                        val evaluation = assignmentProgressEnqueues().last().arguments[2] as VocabularyHomeworkProgressEvaluation
                        val expected = when (policy) {
                            com.playsay.vocabulary.dto.VocabularyHomeworkCompletionPolicy.TEACHER_REVIEW -> "AWAITING_REVIEW"
                            com.playsay.vocabulary.dto.VocabularyHomeworkCompletionPolicy.MASTERY_TARGET -> "IN_PROGRESS"
                            else -> "COMPLETED"
                        }
                        assertEquals(expected, evaluation.state)
                    }
                }
            }
        }
    }

    @Test
    fun `key target acknowledgement is owner scoped monotonic and returned on reload`() {
        val owner = seedOwner("keyboard-ack")
        val seeded = seedPractice(owner, owner, PracticeDelivery.HOMEWORK, PracticeExerciseType.KEYBOARD, VocabularySkill.SPELLING)
        val keySet = practice.keySet(owner, seeded.session.id)
        val firstTarget = keySet.targets.first()

        val acknowledged = practice.acknowledgeKeyPosition(
            owner,
            seeded.session.id,
            VocabularyKeyAcknowledgementRequest(position = 1, targetId = firstTarget.targetId),
        )
        val staleRetry = practice.acknowledgeKeyPosition(
            owner,
            seeded.session.id,
            VocabularyKeyAcknowledgementRequest(position = 0),
        )

        assertEquals(1, acknowledged.lastAcknowledgedPosition)
        assertEquals(1, staleRetry.lastAcknowledgedPosition)
        assertEquals(1, practice.keySet(owner, seeded.session.id).completionContext?.lastAcknowledgedPosition)
        assertEquals(SessionStatus.IN_PROGRESS, sessions.findById(seeded.session.id).orElseThrow().status)
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
            meters,
        )
        val assignmentId = UUID.randomUUID()

        val evaluation = VocabularyHomeworkProgressEvaluation(
            state = "IN_PROGRESS",
            completionRatio = 0.5,
            accuracy = 0.5,
            difficultWordCount = 1,
            distinctGradedPrompts = 1,
            distinctEntries = 1,
            hintsUsed = 0,
            activeDurationMs = 1_000,
            masteryRatio = null,
            completionPolicy = com.playsay.vocabulary.dto.VocabularyHomeworkCompletionPolicy.MEANINGFUL_ACTIVITY,
            completionPolicyVersion = "vocabulary-homework-v1",
        )
        realOutbox.enqueue(assignmentId, seeded.session, evaluation)
        realOutbox.enqueue(assignmentId, seeded.session, evaluation)

        val stored = integrationOutbox.findAll().single()
        val payload = objectMapper.readValue(stored.payload, VocabularyAssignmentProgressPayload::class.java)
        assertEquals(3, stored.sessionRevision)
        assertEquals("PENDING", stored.status)
        assertEquals("IN_PROGRESS", payload.state)
        assertEquals(0.5, payload.completionRatio)
        assertEquals(0.5, payload.accuracy)
        assertEquals(1, payload.difficultWordCount)
        realOutbox.deliverDue()
        val retried = integrationOutbox.findById(stored.id).orElseThrow()
        assertEquals("PENDING", retried.status)
        assertEquals(1, retried.attemptCount)
        assertNotNull(retried.lastError)
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
