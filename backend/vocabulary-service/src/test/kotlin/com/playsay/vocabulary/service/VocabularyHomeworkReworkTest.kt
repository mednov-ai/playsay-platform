package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.*
import com.playsay.vocabulary.entity.*
import com.playsay.vocabulary.repo.*
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.web.server.ResponseStatusException

@SpringBootTest(properties = [
    "spring.datasource.url=jdbc:h2:mem:vocabulary-rework;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.jpa.hibernate.ddl-auto=create-drop", "spring.liquibase.enabled=false",
    "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost/unused-jwks",
])
class VocabularyHomeworkReworkTest @Autowired constructor(
    private val rework: VocabularyHomeworkReworkService,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
) {
    @Test
    fun `mistakes are copied once while immutable source and other learner remain unchanged`() {
        val source = fixture()
        val frozen = items.findAllBySessionIdOrderByPositionAsc(source.id)
        attempts.save(VocabularyPracticeAttemptEntity(sessionId = source.id, itemId = frozen[0].id,
            ownerSubject = source.ownerSubject, clientAttemptId = UUID.randomUUID().toString(), correct = false))
        val peer = sessions.save(VocabularyPracticeSessionEntity(practiceId = source.practiceId, ownerSubject = "peer"))
        val request = request(source)
        val child = rework.rework(request)
        assertEquals(child, rework.rework(request))
        val copied = items.findAllBySessionIdOrderByPositionAsc(child.sessionId)
        assertEquals(1, copied.size)
        assertEquals(frozen[0].prompt, copied.single().prompt)
        assertEquals(frozen[0].snapshotJson, copied.single().snapshotJson)
        assertEquals(frozen[0].lexicalContentRevisionId, copied.single().lexicalContentRevisionId)
        assertNull(copied.single().completedAt)
        assertEquals(0, copied.single().attemptCount)
        assertEquals(SessionStatus.COMPLETED, sessions.findById(source.id).orElseThrow().status)
        assertEquals(1, attempts.findAllBySessionIdOrderByCreatedAtAsc(source.id).size)
        assertEquals(setOf(peer.id, child.sessionId), sessions.findAllByPracticeIdOrderByCreatedAtAsc(source.practiceId).map { it.id }.toSet())
        assertEquals(child.sessionId, sessions.findByPracticeIdAndOwnerSubject(source.practiceId, source.ownerSubject)?.id)
        assertEquals(SessionStatus.NOT_STARTED, sessions.findById(child.sessionId).orElseThrow().status)
        assertThrows(ResponseStatusException::class.java) { rework.rework(request.copy(ownerSubject = "foreign")) }
        assertThrows(ResponseStatusException::class.java) { rework.rework(request.copy(assignmentId = UUID.randomUUID())) }
    }

    @Test
    fun `all correct fallback copies whole frozen set and supports another review round`() {
        val source = fixture()
        val child = rework.rework(request(source))
        assertEquals(2, items.findAllBySessionIdOrderByPositionAsc(child.sessionId).size)
        val completedChild = sessions.findById(child.sessionId).orElseThrow().apply { status = SessionStatus.COMPLETED }
        sessions.save(completedChild)
        val next = rework.rework(request(completedChild))
        assertNotEquals(child.sessionId, next.sessionId)
        assertEquals(2, items.findAllBySessionIdOrderByPositionAsc(next.sessionId).size)
        assertEquals(listOf(next.sessionId), sessions.findAllByPracticeIdOrderByCreatedAtAsc(source.practiceId).map { it.id })
    }

    private fun request(source: VocabularyPracticeSessionEntity) = VocabularyHomeworkReworkRequest(
        requireNotNull(practices.findById(source.practiceId).orElseThrow().assignmentId), source.id, source.ownerSubject, source.ownerSubject,
    )

    private fun fixture(): VocabularyPracticeSessionEntity {
        val practice = practices.save(VocabularyPracticeEntity(assignmentId = UUID.randomUUID(), delivery = PracticeDelivery.HOMEWORK,
            completionPolicy = VocabularyHomeworkCompletionPolicy.TEACHER_REVIEW, status = PracticeStatus.COMPLETED))
        val source = sessions.save(VocabularyPracticeSessionEntity(practiceId = practice.id, ownerSubject = UUID.randomUUID().toString(), status = SessionStatus.COMPLETED))
        items.saveAll((0..1).map { VocabularyPracticeItemEntity(sessionId = source.id, position = it, prompt = "frozen-$it",
            answer = "answer-$it", snapshotJson = "{\"sourceText\":\"frozen-$it\"}", completedAt = Instant.now(), attemptCount = 1) })
        return source
    }
}
