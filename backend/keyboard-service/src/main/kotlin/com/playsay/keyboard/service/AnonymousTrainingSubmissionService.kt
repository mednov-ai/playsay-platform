package com.playsay.keyboard.service

import com.playsay.keyboard.dto.SubmitAnonymousResultRequest
import com.playsay.keyboard.entity.ChordSetEntity
import com.playsay.keyboard.entity.GamificationEventEntity
import com.playsay.keyboard.entity.GamificationProfileEntity
import com.playsay.keyboard.entity.LayoutMasteryProfileEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.repo.ChordSetRepo
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

data class AnonymousTrainingSubmission(
    val saved: TrainingResultEntity,
    val profileId: Long,
    val events: List<GamificationEventEntity>,
    val chordSet: ChordSetEntity,
    val recent: List<TrainingResultEntity>?,
)

@Component
class AnonymousTrainingSubmissionService(
    private val chordSetRepo: ChordSetRepo,
    private val trainingResultRepo: TrainingResultRepo,
    private val gamificationProfileRepo: GamificationProfileRepo,
    private val layoutMasteryProfileRepo: LayoutMasteryProfileRepo,
    private val masteryService: MasteryService,
    private val gamificationService: GamificationService,
    private val anonymousProfileService: AnonymousProfileService,
    private val inputCodec: TrainingInputCodec,
) {
    fun submit(
        request: SubmitAnonymousResultRequest,
        servletRequest: HttpServletRequest,
    ): AnonymousTrainingSubmission {
        val chordSet = chordSetRepo.findById(request.chordSetId)
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Chord set not found.") }
        val profile = anonymousProfileService.upsert(request.deviceId, servletRequest, request.displayName?.trim()?.take(64)?.ifBlank { null })
        inputCodec.clientResultId(request.clientResultId)?.let { clientResultId ->
            trainingResultRepo.findByAnonymousProfileIdAndClientResultId(profile.id, clientResultId)?.let { existing ->
                return AnonymousTrainingSubmission(existing, profile.id, emptyList(), chordSet, null)
            }
        }
        val gamificationProfile = profileForAnonymous(profile.id)
        val lessonKind = inputCodec.lessonKind(request.lessonKind)
        val localDate = inputCodec.localDate(request.localTrainingDate, request.clientTimezone)
        val layoutProfile = layoutProfileForAnonymous(profile.id, chordSet.layout)
        val mastery = masteryService.update(layoutProfile, request.averageCpm, request.accuracy, request.cadence)
        gamificationService.updateProfileBeforeSave(
            gamificationProfile,
            layoutProfile,
            mastery.masteryCpm,
            request.accuracy,
            request.cadence,
            lessonKind,
            localDate,
        )
        val saved = trainingResultRepo.save(
            TrainingResultEntity(
                clientResultId = inputCodec.clientResultId(request.clientResultId),
                anonymousProfileId = profile.id,
                chordSetId = request.chordSetId,
                lessonKind = lessonKind,
                speedCpm = request.speedCpm,
                averageCpm = inputCodec.positiveDouble(request.averageCpm, request.speedCpm),
                cadence = inputCodec.ratio(request.cadence),
                masteryCpm = mastery.masteryCpm,
                masteryDelta = mastery.masteryDelta,
                accuracy = request.accuracy,
                errors = request.errors,
                characterCount = request.characterCount.coerceAtLeast(0),
                correctCount = request.correctCount.coerceAtLeast(0),
                durationMs = request.durationMs,
                windowMetricsJson = inputCodec.windowMetrics(request.windowMetrics),
                practiceContextJson = inputCodec.practiceContext(request.practiceContext),
                clientTimezone = inputCodec.timezone(request.clientTimezone),
                localTrainingDate = localDate,
                perFinger = inputCodec.errorMap(request.perFinger),
                perChar = inputCodec.errorMap(request.perChar),
                perChord = inputCodec.errorMap(request.perChord),
                focusProblemKeys = inputCodec.problemKeys(request.focusProblemKeys),
            ),
        )
        val events = gamificationService.eventsAfterSave(gamificationProfile, layoutProfile, saved)
        val recent = trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id)
        return AnonymousTrainingSubmission(saved, profile.id, events, chordSet, recent)
    }

    private fun profileForAnonymous(anonymousProfileId: Long): GamificationProfileEntity =
        gamificationProfileRepo.findByAnonymousProfileId(anonymousProfileId)
            ?: gamificationProfileRepo.save(GamificationProfileEntity(anonymousProfileId = anonymousProfileId))

    private fun layoutProfileForAnonymous(anonymousProfileId: Long, layout: String): LayoutMasteryProfileEntity =
        layoutMasteryProfileRepo.findByAnonymousProfileIdAndLayout(anonymousProfileId, layout)
            ?: layoutMasteryProfileRepo.save(LayoutMasteryProfileEntity(anonymousProfileId = anonymousProfileId, layout = layout))
}
