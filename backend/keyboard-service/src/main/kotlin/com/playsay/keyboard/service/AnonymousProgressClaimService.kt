package com.playsay.keyboard.service

import com.playsay.keyboard.dto.ClaimAnonymousProgressResponse
import com.playsay.keyboard.entity.GamificationProfileEntity
import com.playsay.keyboard.entity.LayoutMasteryProfileEntity
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import java.time.Instant
import org.springframework.stereotype.Component

@Component
class AnonymousProgressClaimService(
    private val trainingResultRepo: TrainingResultRepo,
    private val gamificationProfileRepo: GamificationProfileRepo,
    private val layoutMasteryProfileRepo: LayoutMasteryProfileRepo,
    private val anonymousProfileService: AnonymousProfileService,
    private val progressService: TrainingProgressService,
) {
    fun claim(subject: String, deviceId: String): ClaimAnonymousProgressResponse {
        val profile = anonymousProfileService.find(deviceId)
            ?: return ClaimAnonymousProgressResponse(0, progressService.authenticated(subject))
        val anonymousResults = trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id)
        anonymousResults.forEach { result ->
            result.keycloakSubject = subject
            result.anonymousProfileId = null
        }
        trainingResultRepo.saveAll(anonymousResults)
        profileForSubject(subject)
        claimLayoutMastery(subject, profile.id)
        return ClaimAnonymousProgressResponse(anonymousResults.size, progressService.authenticated(subject))
    }

    private fun profileForSubject(subject: String): GamificationProfileEntity =
        gamificationProfileRepo.findByKeycloakSubject(subject)
            ?: gamificationProfileRepo.save(GamificationProfileEntity(keycloakSubject = subject))

    private fun claimLayoutMastery(subject: String, anonymousProfileId: Long) {
        val anonymousProfiles = layoutMasteryProfileRepo.findByAnonymousProfileIdOrderByLayoutAsc(anonymousProfileId)
        anonymousProfiles.forEach { anonymousLayoutProfile ->
            val subjectLayoutProfile = layoutProfileForSubject(subject, anonymousLayoutProfile.layout)
            if (anonymousLayoutProfile.masteryCpm >= subjectLayoutProfile.masteryCpm) {
                copyMastery(anonymousLayoutProfile, subjectLayoutProfile)
            }
            subjectLayoutProfile.updatedAt = Instant.now()
            layoutMasteryProfileRepo.save(subjectLayoutProfile)
        }
        layoutMasteryProfileRepo.deleteAll(anonymousProfiles)
    }

    private fun copyMastery(source: LayoutMasteryProfileEntity, target: LayoutMasteryProfileEntity) {
        target.masteryCpm = source.masteryCpm
        target.baselineMasteryCpm = source.baselineMasteryCpm
        target.leagueLevel = source.leagueLevel
        target.calibrationSessionCount = source.calibrationSessionCount
        target.calibrationMasteryTotal = source.calibrationMasteryTotal
        target.calibrationCompletedAt = source.calibrationCompletedAt
        target.trendJson = source.trendJson
    }

    private fun layoutProfileForSubject(subject: String, layout: String): LayoutMasteryProfileEntity =
        layoutMasteryProfileRepo.findByKeycloakSubjectAndLayout(subject, layout)
            ?: layoutMasteryProfileRepo.save(LayoutMasteryProfileEntity(keycloakSubject = subject, layout = layout))
}
