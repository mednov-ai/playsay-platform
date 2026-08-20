package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.VocabularyPracticeResponse
import com.playsay.vocabulary.dto.VocabularyPracticeStatusRequest
import java.util.UUID
import org.springframework.stereotype.Service

@Service
class VocabularyPracticeStatusService(
    private val liveCoordination: VocabularyLiveCoordinationService,
    private val queryService: VocabularyPracticeQueryService,
    private val assignmentProgress: VocabularyAssignmentProgressPublisher,
    private val eventPublisher: VocabularyPracticeEventPublisher,
) {
    fun status(
        actorSubject: String,
        practiceId: UUID,
        request: VocabularyPracticeStatusRequest,
    ): VocabularyPracticeResponse {
        val transition = liveCoordination.transition(actorSubject, practiceId, request.status)
        val practice = transition.practice
        practice.assignmentId?.let { assignmentId ->
            transition.sessions.forEach { session -> assignmentProgress.publish(assignmentId, session) }
        }
        val response = queryService.practiceResponse(practice)
        val eventType = when (request.status) {
            PracticeStatus.PAUSED -> "vocabulary.practice.paused"
            PracticeStatus.COMPLETED, PracticeStatus.CANCELLED -> "vocabulary.practice.completed"
            else -> "vocabulary.practice.started"
        }
        eventPublisher.publish(eventType, actorSubject, practice, response)
        return response
    }

    fun completeClosedLessonRuns() {
        liveCoordination.closedLessonRuns().forEach { practice ->
            status(
                practice.createdBySubject,
                practice.id,
                VocabularyPracticeStatusRequest(PracticeStatus.COMPLETED),
            )
        }
    }
}
