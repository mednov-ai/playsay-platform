package com.playsay.vocabulary.service

import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticeAttemptRepo
import com.playsay.vocabulary.repo.VocabularyPracticePlanRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyUserDataService(
    private val entries: VocabularyEntryRepo,
    private val skillStates: VocabularySkillStateRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val practices: VocabularyPracticeRepo,
    private val plans: VocabularyPracticePlanRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
) {
    @Transactional
    fun purge(subject: String, presentedToken: String?) {
        if (serviceToken.isBlank() || presentedToken != serviceToken) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        plans.deleteContainingSubject(subject)
        attempts.deleteByOwnerSubject(subject)
        sessions.deleteByOwnerSubject(subject)
        practices.clearSettingsContainingSubject(subject)
        practices.deleteByCreatedBySubject(subject)
        skillStates.deleteByEntryOwnerSubject(subject)
        entries.deleteByOwnerSubject(subject)
    }
}
