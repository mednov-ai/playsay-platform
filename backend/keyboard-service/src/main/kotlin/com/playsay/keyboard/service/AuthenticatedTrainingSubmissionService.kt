package com.playsay.keyboard.service

import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.entity.ChordSetEntity
import com.playsay.keyboard.entity.GamificationEventEntity
import com.playsay.keyboard.entity.GamificationProfileEntity
import com.playsay.keyboard.entity.LayoutMasteryProfileEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.repo.ChordSetRepo
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

data class AuthenticatedTrainingSubmission(
    val saved: TrainingResultEntity,
    val events: List<GamificationEventEntity>,
    val chordSet: ChordSetEntity,
    val recent: List<TrainingResultEntity>?,
)

@Component
class AuthenticatedTrainingSubmissionService(
    private val chordSetRepo: ChordSetRepo,
    private val trainingResultRepo: TrainingResultRepo,
    private val gamificationProfileRepo: GamificationProfileRepo,
    private val layoutMasteryProfileRepo: LayoutMasteryProfileRepo,
    private val masteryService: MasteryService,
    private val gamificationService: GamificationService,
    private val vocabularyResults: KeyboardVocabularyResultOutbox,
    private val inputCodec: TrainingInputCodec,
) {
    fun submit(subject: String, request: SubmitResultRequest): AuthenticatedTrainingSubmission {
        val chordSet = chordSetRepo.findById(request.chordSetId)
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Chord set not found.") }
        inputCodec.clientResultId(request.clientResultId)?.let { clientResultId ->
            trainingResultRepo.findByKeycloakSubjectAndClientResultId(subject, clientResultId)?.let { existing ->
                return AuthenticatedTrainingSubmission(existing, emptyList(), chordSet, null)
            }
        }
        val profile = profileForSubject(subject)
        val lessonKind = inputCodec.lessonKind(request.lessonKind)
        val localDate = inputCodec.localDate(request.localTrainingDate, request.clientTimezone)
        val layoutProfile = layoutProfileForSubject(subject, chordSet.layout)
        val mastery = masteryService.update(layoutProfile, request.averageCpm, request.accuracy, request.cadence)
        gamificationService.updateProfileBeforeSave(
            profile,
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
                keycloakSubject = subject,
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
        val events = gamificationService.eventsAfterSave(profile, layoutProfile, saved)
        vocabularyResults.enqueue(saved, request)
        val recent = trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc(subject)
        return AuthenticatedTrainingSubmission(saved, events, chordSet, recent)
    }

    private fun profileForSubject(subject: String): GamificationProfileEntity =
        gamificationProfileRepo.findByKeycloakSubject(subject)
            ?: gamificationProfileRepo.save(GamificationProfileEntity(keycloakSubject = subject))

    private fun layoutProfileForSubject(subject: String, layout: String): LayoutMasteryProfileEntity =
        layoutMasteryProfileRepo.findByKeycloakSubjectAndLayout(subject, layout)
            ?: layoutMasteryProfileRepo.save(LayoutMasteryProfileEntity(keycloakSubject = subject, layout = layout))
}
