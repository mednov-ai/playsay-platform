package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service

@Service
class VocabularyPracticeCompletionService(
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
) {
    fun completeIfNeeded(practiceId: UUID, now: Instant) {
        val practiceSessions = sessions.findAllByPracticeIdOrderByCreatedAtAsc(practiceId)
        if (practiceSessions.isNotEmpty() && practiceSessions.all { it.status in completionTerminalSessionStatuses }) {
            val practice = practices.findById(practiceId).orElseThrow()
            practice.status = PracticeStatus.COMPLETED
            practice.completedAt = now
            practice.updatedAt = now
            practices.save(practice)
        }
    }
}

private val completionTerminalSessionStatuses = setOf(SessionStatus.COMPLETED, SessionStatus.CANCELLED)
