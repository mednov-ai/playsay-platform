package com.playsay.keyboard.service

import com.playsay.keyboard.repo.GamificationEventRepo
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class KeyboardUserDataService(
    private val trainingResults: TrainingResultRepo,
    private val events: GamificationEventRepo,
    private val profiles: GamificationProfileRepo,
    private val layoutProfiles: LayoutMasteryProfileRepo,
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
) {
    @Transactional
    fun purge(subject: String, presentedToken: String?) {
        if (serviceToken.isBlank() || presentedToken != serviceToken) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        trainingResults.findByKeycloakSubjectOrderByCreatedAtDesc(subject).forEach { it.keycloakSubject = null }
        events.findByKeycloakSubject(subject).forEach { it.keycloakSubject = null }
        profiles.findByKeycloakSubject(subject)?.let(profiles::delete)
        layoutProfiles.deleteByKeycloakSubject(subject)
    }
}
