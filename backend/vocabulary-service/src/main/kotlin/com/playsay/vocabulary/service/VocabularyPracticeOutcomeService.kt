package com.playsay.vocabulary.service

import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import java.time.Instant
import org.springframework.stereotype.Service

@Service
class VocabularyPracticeOutcomeService(
    private val practices: VocabularyPracticeRepo,
    private val completion: VocabularyPracticeCompletionService,
    private val assignmentProgress: VocabularyAssignmentProgressPublisher,
    private val queryService: VocabularyPracticeQueryService,
    private val eventPublisher: VocabularyPracticeEventPublisher,
) {
    fun publishAttempt(actorSubject: String, session: VocabularyPracticeSessionEntity, now: Instant) {
        completion.completeIfNeeded(session.practiceId, now)
        val practice = practices.findById(session.practiceId).orElseThrow()
        practice.assignmentId?.let { assignmentId -> assignmentProgress.publish(assignmentId, session) }
        eventPublisher.publish(
            "vocabulary.attempt.recorded",
            actorSubject,
            practice,
            queryService.practiceResponse(practice),
            session.id,
        )
    }

    fun publishSessionUpdated(
        actorSubject: String,
        practice: VocabularyPracticeEntity,
        session: VocabularyPracticeSessionEntity,
    ) {
        eventPublisher.publish(
            "vocabulary.session.updated",
            actorSubject,
            practice,
            queryService.practiceResponse(practice),
            session.id,
        )
    }
}
