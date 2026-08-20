package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyLiveCoordinationService(
    private val access: VocabularyAccessService,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
) {
    @Transactional
    fun requireAvailableLesson(lessonId: UUID) {
        access.lockLesson(lessonId)
        if (practices.findFirstByLessonIdAndStatusInOrderByUpdatedAtDesc(lessonId, activeStatuses) != null) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "A vocabulary practice is already active for this lesson.")
        }
    }

    @Transactional
    fun transition(
        actorSubject: String,
        practiceId: UUID,
        target: PracticeStatus,
    ): VocabularyLiveTransition {
        val practice = practices.findById(practiceId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND)
        }
        if (practice.createdBySubject != actorSubject) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        if (target !in mutableStatuses) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported vocabulary practice status.")
        }
        if (practice.status == target) {
            return VocabularyLiveTransition(practice, sessions.findAllByPracticeIdOrderByCreatedAtAsc(practice.id))
        }

        val now = Instant.now()
        practice.status = target
        practice.updatedAt = now
        if (target == PracticeStatus.ACTIVE && practice.startedAt == null) practice.startedAt = now
        if (target in terminalStatuses) practice.completedAt = now
        val practiceSessions = sessions.findAllByPracticeIdOrderByCreatedAtAsc(practice.id)
        practiceSessions.forEach { session ->
            session.status = sessionStatus(target, session.status)
            if (session.status == SessionStatus.COMPLETED && session.completedAt == null) session.completedAt = now
            session.revision += 1
            session.updatedAt = now
        }
        sessions.saveAll(practiceSessions)
        practices.save(practice)
        return VocabularyLiveTransition(practice, practiceSessions)
    }

    @Transactional(readOnly = true)
    fun closedLessonRuns(): List<VocabularyPracticeEntity> =
        practices.findLivePracticesForClosedLessons()

    private fun sessionStatus(target: PracticeStatus, current: SessionStatus): SessionStatus = when (target) {
        PracticeStatus.PAUSED -> if (current == SessionStatus.IN_PROGRESS) SessionStatus.PAUSED else current
        PracticeStatus.ACTIVE -> if (current == SessionStatus.PAUSED) SessionStatus.IN_PROGRESS else current
        PracticeStatus.CANCELLED -> if (current != SessionStatus.COMPLETED) SessionStatus.CANCELLED else current
        PracticeStatus.COMPLETED -> if (current != SessionStatus.COMPLETED) SessionStatus.COMPLETED else current
        else -> current
    }
}

data class VocabularyLiveTransition(
    val practice: VocabularyPracticeEntity,
    val sessions: List<VocabularyPracticeSessionEntity>,
)

private val activeStatuses = setOf(PracticeStatus.PUBLISHED, PracticeStatus.ACTIVE, PracticeStatus.PAUSED)
private val mutableStatuses = setOf(
    PracticeStatus.ACTIVE,
    PracticeStatus.PAUSED,
    PracticeStatus.COMPLETED,
    PracticeStatus.CANCELLED,
)
private val terminalStatuses = setOf(PracticeStatus.COMPLETED, PracticeStatus.CANCELLED)
