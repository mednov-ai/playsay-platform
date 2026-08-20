package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.VocabularyPracticeResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSessionSummaryResponse
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.realtime.VocabularyPracticeChangedEvent
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Service

@Service
class VocabularyPracticeEventPublisher(
    private val events: ApplicationEventPublisher,
) {
    fun publish(
        type: String,
        actorSubject: String,
        practice: VocabularyPracticeEntity,
        response: VocabularyPracticeResponse,
        sessionId: UUID? = null,
    ) {
        events.publishEvent(
            VocabularyPracticeChangedEvent(
                type = type,
                actorSubject = actorSubject,
                practiceId = practice.id,
                lessonId = practice.lessonId,
                ownerSubjects = response.sessions.map(VocabularyPracticeSessionSummaryResponse::ownerSubject).toSet(),
                sessionId = sessionId,
                practice = response,
            ),
        )
    }
}
