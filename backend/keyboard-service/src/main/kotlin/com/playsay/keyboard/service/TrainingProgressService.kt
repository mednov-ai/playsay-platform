package com.playsay.keyboard.service

import com.playsay.keyboard.dto.FingerErrorsResponse
import com.playsay.keyboard.dto.ProgressResponse
import com.playsay.keyboard.dto.TrainingResultResponse
import com.playsay.keyboard.entity.GamificationProfileEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.mapper.toResponse
import com.playsay.keyboard.repo.ChordSetRepo
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import org.springframework.stereotype.Component

@Component
class TrainingProgressService(
    private val trainingResultRepo: TrainingResultRepo,
    private val gamificationProfileRepo: GamificationProfileRepo,
    private val layoutMasteryProfileRepo: LayoutMasteryProfileRepo,
    private val chordSetRepo: ChordSetRepo,
    private val gamificationService: GamificationService,
) {
    fun authenticated(subject: String): ProgressResponse {
        val results = trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc(subject)
        val gamification = gamificationProfileRepo.findByKeycloakSubject(subject)
        val layoutProfiles = layoutMasteryProfileRepo.findByKeycloakSubjectOrderByLayoutAsc(subject)
        if (results.isEmpty()) {
            return ProgressResponse(
                sessions = 0,
                bestSpeedCpm = 0.0,
                avgSpeedCpm = 0.0,
                avgAccuracy = 0.0,
                masteryCpm = layoutProfiles.firstOrNull()?.masteryCpm ?: gamification?.masteryCpm,
                weakFingers = emptyList(),
                recent = emptyList(),
                gamification = gamification?.let { gamificationService.toResponse(it, layoutProfiles) },
            )
        }
        return progressResponse(
            results = results,
            sessions = results.size,
            masteryCpm = layoutProfiles.firstOrNull()?.masteryCpm ?: gamification?.masteryCpm
                ?: results.firstOrNull()?.masteryCpm,
            gamification = gamification?.let { gamificationService.toResponse(it, layoutProfiles) },
        )
    }

    fun anonymous(
        anonymousProfileId: Long?,
        results: List<TrainingResultEntity>,
        profile: GamificationProfileEntity?,
    ): ProgressResponse {
        val layoutProfiles = anonymousProfileId
            ?.let(layoutMasteryProfileRepo::findByAnonymousProfileIdOrderByLayoutAsc)
            .orEmpty()
        if (results.isEmpty()) {
            return ProgressResponse(
                sessions = 0,
                bestSpeedCpm = 0.0,
                avgSpeedCpm = 0.0,
                avgAccuracy = 0.0,
                masteryCpm = layoutProfiles.firstOrNull()?.masteryCpm ?: profile?.masteryCpm,
                weakFingers = emptyList(),
                recent = emptyList(),
                gamification = profile?.let { gamificationService.toResponse(it, layoutProfiles) },
            )
        }
        return progressResponse(
            results = results,
            sessions = anonymousProfileId?.let(trainingResultRepo::countByAnonymousProfileId) ?: results.size,
            masteryCpm = layoutProfiles.firstOrNull()?.masteryCpm ?: profile?.masteryCpm
                ?: results.firstOrNull()?.masteryCpm,
            gamification = profile?.let { gamificationService.toResponse(it, layoutProfiles) },
        )
    }

    private fun progressResponse(
        results: List<TrainingResultEntity>,
        sessions: Int,
        masteryCpm: Double?,
        gamification: com.playsay.keyboard.dto.GamificationProfileResponse?,
    ): ProgressResponse {
        val weakFingers = results
            .flatMap { result -> result.perFinger.entries }
            .groupBy({ entry -> entry.key }, { entry -> entry.value })
            .map { (finger, errors) -> FingerErrorsResponse(finger, errors.sum()) }
            .sortedByDescending(FingerErrorsResponse::errors)
        return ProgressResponse(
            sessions = sessions,
            bestSpeedCpm = results.maxOf(TrainingResultEntity::speedCpm),
            avgSpeedCpm = results.map(TrainingResultEntity::speedCpm).average(),
            avgAccuracy = results.map(TrainingResultEntity::accuracy).average(),
            masteryCpm = masteryCpm,
            weakFingers = weakFingers,
            recent = resultResponses(results.take(10)),
            gamification = gamification,
        )
    }

    private fun resultResponses(results: List<TrainingResultEntity>): List<TrainingResultResponse> {
        if (results.isEmpty()) return emptyList()
        val layouts = chordSetRepo.findAllById(results.map(TrainingResultEntity::chordSetId).toSet())
            .associate { chordSet -> chordSet.id to chordSet.layout }
        return results.map { result -> result.toResponse(layouts[result.chordSetId] ?: "UNKNOWN") }
    }
}
