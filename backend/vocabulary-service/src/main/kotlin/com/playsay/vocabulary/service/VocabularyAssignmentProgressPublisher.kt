package com.playsay.vocabulary.service

import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeAttemptRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
import com.playsay.vocabulary.repo.VocabularyKeyResultRepo
import java.util.UUID
import org.springframework.stereotype.Service
import io.micrometer.core.instrument.MeterRegistry

@Service
class VocabularyAssignmentProgressPublisher(
    private val items: VocabularyPracticeItemRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
    private val practices: VocabularyPracticeRepo,
    private val skillStates: VocabularySkillStateRepo,
    private val keyResults: VocabularyKeyResultRepo,
    private val completionEvaluator: VocabularyHomeworkCompletionEvaluator,
    private val outbox: VocabularyAssignmentProgressOutbox,
    private val meters: MeterRegistry,
) {
    fun publish(assignmentId: UUID, session: VocabularyPracticeSessionEntity) {
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
        val practice = practices.findById(session.practiceId).orElseThrow()
        val entryIds = sessionItems.mapNotNull { it.entryId }.distinct()
        val evaluation = completionEvaluator.evaluate(
            practice,
            session,
            sessionItems,
            attempts.findAllBySessionIdOrderByCreatedAtAsc(session.id),
            if (entryIds.isEmpty()) emptyList() else skillStates.findAllByEntryIdIn(entryIds),
            keyResults.findAllBySessionIdOrderByPositionAsc(session.id),
        )
        meters.counter(
            "playsay.vocabulary.completion.transition",
            "state",
            evaluation.state,
            "policy",
            evaluation.completionPolicy.name,
        ).increment()
        outbox.enqueue(
            assignmentId = assignmentId,
            session = session,
            evaluation = evaluation,
        )
    }
}
