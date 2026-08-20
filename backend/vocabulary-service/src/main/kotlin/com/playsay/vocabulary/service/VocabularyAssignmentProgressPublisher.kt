package com.playsay.vocabulary.service

import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import java.util.UUID
import org.springframework.stereotype.Service

@Service
class VocabularyAssignmentProgressPublisher(
    private val items: VocabularyPracticeItemRepo,
    private val outbox: VocabularyAssignmentProgressOutbox,
) {
    fun publish(assignmentId: UUID, session: VocabularyPracticeSessionEntity) {
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
        outbox.enqueue(
            assignmentId = assignmentId,
            session = session,
            completedItems = sessionItems.count { it.completedAt != null },
            totalItems = sessionItems.size,
            difficultWordCount = sessionItems.count { it.attemptCount > 1 },
        )
    }
}
