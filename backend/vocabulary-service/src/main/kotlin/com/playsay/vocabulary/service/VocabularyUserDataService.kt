package com.playsay.vocabulary.service

import com.playsay.vocabulary.repo.VocabularyEntryRepo
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyUserDataService(
    private val entries: VocabularyEntryRepo,
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
) {
    @Transactional
    fun purge(subject: String, presentedToken: String?) {
        if (serviceToken.isBlank() || presentedToken != serviceToken) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        entries.deleteByOwnerSubject(subject)
    }
}
