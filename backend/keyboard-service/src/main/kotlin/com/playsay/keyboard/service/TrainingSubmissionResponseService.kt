package com.playsay.keyboard.service

import com.playsay.keyboard.dto.SubmitTrainingResultResponse
import com.playsay.keyboard.entity.ChordSetEntity
import com.playsay.keyboard.entity.GamificationEventEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.mapper.toResponse
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import java.util.Locale
import org.springframework.stereotype.Component

@Component
class TrainingSubmissionResponseService(
    private val trainingResultRepo: TrainingResultRepo,
    private val gamificationProfileRepo: GamificationProfileRepo,
    private val layoutMasteryProfileRepo: LayoutMasteryProfileRepo,
    private val gamificationService: GamificationService,
    private val techniqueAdviceService: TechniqueAdviceService,
    private val progressService: TrainingProgressService,
    private val focusLessonService: FocusLessonRecommendationService,
) {
    fun response(
        saved: TrainingResultEntity,
        subject: String?,
        anonymousProfileId: Long?,
        events: List<GamificationEventEntity>,
        chordSet: ChordSetEntity,
        recentOverride: List<TrainingResultEntity>?,
        locale: Locale,
    ): SubmitTrainingResultResponse {
        val recent = recentOverride
            ?: subject?.let(trainingResultRepo::findByKeycloakSubjectOrderByCreatedAtDesc)
            ?: anonymousProfileId?.let(trainingResultRepo::findByAnonymousProfileIdOrderByCreatedAtDesc)
            ?: emptyList()
        val profile = subject?.let(gamificationProfileRepo::findByKeycloakSubject)
            ?: anonymousProfileId?.let(gamificationProfileRepo::findByAnonymousProfileId)
        val layoutProfiles = subject?.let(layoutMasteryProfileRepo::findByKeycloakSubjectOrderByLayoutAsc)
            ?: anonymousProfileId?.let(layoutMasteryProfileRepo::findByAnonymousProfileIdOrderByLayoutAsc)
            ?: emptyList()
        val progress = subject?.let(progressService::authenticated)
            ?: progressService.anonymous(anonymousProfileId, recent, profile)
        return SubmitTrainingResultResponse(
            trainingResult = saved.toResponse(chordSet.layout).copy(
                focusLesson = focusLessonService.recommend(saved, recent, chordSet),
            ),
            progress = progress,
            gamification = gamificationService.toResponse(
                profile ?: gamificationService.emptyProfile(),
                layoutProfiles,
                chordSet.layout,
            ),
            events = events.map(gamificationService::eventToResponse),
            techniqueAdvice = techniqueAdviceService.advice(saved, recent, locale),
        )
    }
}
