package com.playsay.keyboard.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.keyboard.dto.AnonymousProfileResponse
import com.playsay.keyboard.dto.ClaimAnonymousProgressRequest
import com.playsay.keyboard.dto.ClaimAnonymousProgressResponse
import com.playsay.keyboard.dto.FingerErrorsResponse
import com.playsay.keyboard.dto.FocusLessonResponse
import com.playsay.keyboard.dto.GamificationEventResponse
import com.playsay.keyboard.dto.GamificationProfileResponse
import com.playsay.keyboard.dto.ProgressResponse
import com.playsay.keyboard.dto.ResolveAnonymousProfileRequest
import com.playsay.keyboard.dto.ResetAnonymousProfileRequest
import com.playsay.keyboard.dto.SubmitAnonymousResultRequest
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.dto.SubmitTrainingResultResponse
import com.playsay.keyboard.dto.TechniqueAdviceResponse
import com.playsay.keyboard.dto.TrainingResultResponse
import com.playsay.keyboard.dto.UpdateAnonymousProfileRequest
import com.playsay.keyboard.entity.AnonymousProfileEntity
import com.playsay.keyboard.entity.ChordSetEntity
import com.playsay.keyboard.entity.GamificationEventEntity
import com.playsay.keyboard.entity.GamificationProfileEntity
import com.playsay.keyboard.entity.LayoutMasteryProfileEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.mapper.toResponse
import com.playsay.keyboard.repo.AnonymousProfileRepo
import com.playsay.keyboard.repo.ChordSetRepo
import com.playsay.keyboard.repo.GamificationEventRepo
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.util.Locale
import kotlin.math.round

@Service
class TrainingService(
    private val chordSetRepo: ChordSetRepo,
    private val trainingResultRepo: TrainingResultRepo,
    private val gamificationEventRepo: GamificationEventRepo,
    private val gamificationProfileRepo: GamificationProfileRepo,
    private val layoutMasteryProfileRepo: LayoutMasteryProfileRepo,
    private val anonymousProfileRepo: AnonymousProfileRepo,
    private val anonymousFingerprintService: AnonymousFingerprintService,
    private val masteryService: MasteryService,
    private val gamificationService: GamificationService,
    private val techniqueAdviceService: TechniqueAdviceService,
    private val vocabularyResults: KeyboardVocabularyResultOutbox,
) {
    @Transactional
    fun submit(
        subject: String,
        request: SubmitResultRequest,
        locale: Locale = Locale.forLanguageTag("ru"),
    ): SubmitTrainingResultResponse {
        val chordSet = requireChordSet(request.chordSetId)
        cleanClientResultId(request.clientResultId)?.let { clientResultId ->
            val existing = trainingResultRepo.findByKeycloakSubjectAndClientResultId(subject, clientResultId)
            if (existing != null) {
                return submitResponse(existing, subject, null, emptyList(), chordSet, locale = locale)
            }
        }
        val profile = profileForSubject(subject)
        val lessonKind = normalizeLessonKind(request.lessonKind)
        val localDate = parseLocalDate(request.localTrainingDate, request.clientTimezone)
        val layoutProfile = layoutProfileForSubject(subject, chordSet.layout)
        val mastery = masteryService.update(layoutProfile, request.averageCpm, request.accuracy, request.cadence)
        gamificationService.updateProfileBeforeSave(profile, layoutProfile, mastery.masteryCpm, request.accuracy, request.cadence, lessonKind, localDate)
        val saved = trainingResultRepo.save(
            TrainingResultEntity(
                clientResultId = cleanClientResultId(request.clientResultId),
                keycloakSubject = subject,
                chordSetId = request.chordSetId,
                lessonKind = lessonKind,
                speedCpm = request.speedCpm,
                averageCpm = cleanPositiveDouble(request.averageCpm, request.speedCpm),
                cadence = cleanRatio(request.cadence),
                masteryCpm = mastery.masteryCpm,
                masteryDelta = mastery.masteryDelta,
                accuracy = request.accuracy,
                errors = request.errors,
                characterCount = request.characterCount.coerceAtLeast(0),
                correctCount = request.correctCount.coerceAtLeast(0),
                durationMs = request.durationMs,
                windowMetricsJson = windowMetricsJson(request.windowMetrics),
                practiceContextJson = practiceContextJson(request.practiceContext),
                clientTimezone = cleanTimezone(request.clientTimezone),
                localTrainingDate = localDate,
                perFinger = sanitizeErrorMap(request.perFinger),
                perChar = sanitizeErrorMap(request.perChar),
                perChord = sanitizeErrorMap(request.perChord),
                focusProblemKeys = sanitizeProblemKeys(request.focusProblemKeys),
            ),
        )
        val events = gamificationService.eventsAfterSave(profile, layoutProfile, saved)
        vocabularyResults.enqueue(saved, request)
        val recent = trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc(subject)
        return submitResponse(saved, subject, null, events, chordSet, recent, locale)
    }

    @Transactional
    fun resolveAnonymousProfile(request: ResolveAnonymousProfileRequest, servletRequest: HttpServletRequest): AnonymousProfileResponse {
        val profile = upsertAnonymousProfile(request.deviceId, servletRequest, displayName = null)
        return profile.toResponse()
    }

    @Transactional
    fun updateAnonymousProfile(request: UpdateAnonymousProfileRequest, servletRequest: HttpServletRequest): AnonymousProfileResponse {
        val profile = upsertAnonymousProfile(request.deviceId, servletRequest, cleanDisplayName(request.displayName))
        return profile.toResponse()
    }

    @Transactional
    fun resetAnonymousProfile(request: ResetAnonymousProfileRequest) {
        val deviceId = normalizeDeviceId(request.deviceId)
        val profile = anonymousProfileRepo.findByDeviceId(deviceId) ?: return

        val events = gamificationEventRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id)
        val layoutProfiles = layoutMasteryProfileRepo.findByAnonymousProfileIdOrderByLayoutAsc(profile.id)
        val gamificationProfile = gamificationProfileRepo.findByAnonymousProfileId(profile.id)
        val results = trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id)

        gamificationEventRepo.deleteAll(events)
        layoutMasteryProfileRepo.deleteAll(layoutProfiles)
        if (gamificationProfile != null) {
            gamificationProfileRepo.delete(gamificationProfile)
        }
        trainingResultRepo.deleteAll(results)
        anonymousProfileRepo.delete(profile)
    }

    @Transactional
    fun submitAnonymous(
        request: SubmitAnonymousResultRequest,
        servletRequest: HttpServletRequest,
        locale: Locale = Locale.forLanguageTag("ru"),
    ): SubmitTrainingResultResponse {
        val chordSet = requireChordSet(request.chordSetId)
        val profile = upsertAnonymousProfile(request.deviceId, servletRequest, cleanDisplayName(request.displayName))
        cleanClientResultId(request.clientResultId)?.let { clientResultId ->
            val existing = trainingResultRepo.findByAnonymousProfileIdAndClientResultId(profile.id, clientResultId)
            if (existing != null) {
                return submitResponse(existing, null, profile.id, emptyList(), chordSet, locale = locale)
            }
        }
        val gamificationProfile = profileForAnonymous(profile.id)
        val lessonKind = normalizeLessonKind(request.lessonKind)
        val localDate = parseLocalDate(request.localTrainingDate, request.clientTimezone)
        val layoutProfile = layoutProfileForAnonymous(profile.id, chordSet.layout)
        val mastery = masteryService.update(layoutProfile, request.averageCpm, request.accuracy, request.cadence)
        gamificationService.updateProfileBeforeSave(gamificationProfile, layoutProfile, mastery.masteryCpm, request.accuracy, request.cadence, lessonKind, localDate)
        val saved = trainingResultRepo.save(
            TrainingResultEntity(
                clientResultId = cleanClientResultId(request.clientResultId),
                anonymousProfileId = profile.id,
                chordSetId = request.chordSetId,
                lessonKind = lessonKind,
                speedCpm = request.speedCpm,
                averageCpm = cleanPositiveDouble(request.averageCpm, request.speedCpm),
                cadence = cleanRatio(request.cadence),
                masteryCpm = mastery.masteryCpm,
                masteryDelta = mastery.masteryDelta,
                accuracy = request.accuracy,
                errors = request.errors,
                characterCount = request.characterCount.coerceAtLeast(0),
                correctCount = request.correctCount.coerceAtLeast(0),
                durationMs = request.durationMs,
                windowMetricsJson = windowMetricsJson(request.windowMetrics),
                practiceContextJson = practiceContextJson(request.practiceContext),
                clientTimezone = cleanTimezone(request.clientTimezone),
                localTrainingDate = localDate,
                perFinger = sanitizeErrorMap(request.perFinger),
                perChar = sanitizeErrorMap(request.perChar),
                perChord = sanitizeErrorMap(request.perChord),
                focusProblemKeys = sanitizeProblemKeys(request.focusProblemKeys),
            ),
        )
        val events = gamificationService.eventsAfterSave(gamificationProfile, layoutProfile, saved)
        val recent = trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id)
        return submitResponse(saved, null, profile.id, events, chordSet, recent, locale)
    }

    @Transactional
    fun claimAnonymous(subject: String, request: ClaimAnonymousProgressRequest): ClaimAnonymousProgressResponse {
        val deviceId = normalizeDeviceId(request.deviceId)
        val profile = anonymousProfileRepo.findByDeviceId(deviceId)
            ?: return ClaimAnonymousProgressResponse(claimedResults = 0, progress = progress(subject))
        val anonymousResults = trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id)
        anonymousResults.forEach { result ->
            result.keycloakSubject = subject
            result.anonymousProfileId = null
        }
        trainingResultRepo.saveAll(anonymousResults)
        profileForSubject(subject)
        claimAnonymousLayoutMastery(subject, profile.id)
        return ClaimAnonymousProgressResponse(
            claimedResults = anonymousResults.size,
            progress = progress(subject),
        )
    }

    @Transactional(readOnly = true)
    fun progress(subject: String): ProgressResponse {
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

        val weakFingers = results
            .flatMap { result -> result.perFinger.entries }
            .groupBy({ entry -> entry.key }, { entry -> entry.value })
            .map { (finger, errors) -> FingerErrorsResponse(finger = finger, errors = errors.sum()) }
            .sortedByDescending { finger -> finger.errors }

        return ProgressResponse(
            sessions = results.size,
            bestSpeedCpm = results.maxOf { result -> result.speedCpm },
            avgSpeedCpm = results.map { result -> result.speedCpm }.average(),
            avgAccuracy = results.map { result -> result.accuracy }.average(),
            masteryCpm = layoutProfiles.firstOrNull()?.masteryCpm ?: gamification?.masteryCpm ?: results.firstOrNull()?.masteryCpm,
            weakFingers = weakFingers,
            recent = resultResponses(results.take(10)),
            gamification = gamification?.let { gamificationService.toResponse(it, layoutProfiles) },
        )
    }

    private fun submitResponse(
        saved: TrainingResultEntity,
        subject: String?,
        anonymousProfileId: Long?,
        events: List<GamificationEventEntity>,
        chordSet: ChordSetEntity,
        recentOverride: List<TrainingResultEntity>? = null,
        locale: Locale = Locale.forLanguageTag("ru"),
    ): SubmitTrainingResultResponse {
        val recent = recentOverride
            ?: subject?.let { trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc(it) }
            ?: anonymousProfileId?.let { trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(it) }
            ?: emptyList()
        val focusLesson = focusLesson(saved, recent, chordSet)
        val profile = subject?.let { gamificationProfileRepo.findByKeycloakSubject(it) }
            ?: anonymousProfileId?.let { gamificationProfileRepo.findByAnonymousProfileId(it) }
        val layoutProfiles = subject?.let { layoutMasteryProfileRepo.findByKeycloakSubjectOrderByLayoutAsc(it) }
            ?: anonymousProfileId?.let { layoutMasteryProfileRepo.findByAnonymousProfileIdOrderByLayoutAsc(it) }
            ?: emptyList()
        val progress = subject?.let { progress(it) }
            ?: anonymousProgress(anonymousProfileId, recent, profile)
        return SubmitTrainingResultResponse(
            trainingResult = saved.toResponse(chordSet.layout).copy(focusLesson = focusLesson),
            progress = progress,
            gamification = gamificationService.toResponse(profile ?: gamificationService.emptyProfile(), layoutProfiles, chordSet.layout),
            events = events.map { event -> gamificationService.eventToResponse(event) },
            techniqueAdvice = techniqueAdviceService.advice(saved, recent, locale),
        )
    }

    private fun anonymousProgress(
        anonymousProfileId: Long?,
        results: List<TrainingResultEntity>,
        profile: GamificationProfileEntity?,
    ): ProgressResponse =
        if (results.isEmpty()) {
            val layoutProfiles = anonymousProfileId?.let { layoutMasteryProfileRepo.findByAnonymousProfileIdOrderByLayoutAsc(it) }.orEmpty()
            ProgressResponse(
                sessions = 0,
                bestSpeedCpm = 0.0,
                avgSpeedCpm = 0.0,
                avgAccuracy = 0.0,
                masteryCpm = layoutProfiles.firstOrNull()?.masteryCpm ?: profile?.masteryCpm,
                weakFingers = emptyList(),
                recent = emptyList(),
                gamification = profile?.let { gamificationService.toResponse(it, layoutProfiles) },
            )
        } else {
            val layoutProfiles = anonymousProfileId?.let { layoutMasteryProfileRepo.findByAnonymousProfileIdOrderByLayoutAsc(it) }.orEmpty()
            val weakFingers = results
                .flatMap { result -> result.perFinger.entries }
                .groupBy({ entry -> entry.key }, { entry -> entry.value })
                .map { (finger, errors) -> FingerErrorsResponse(finger = finger, errors = errors.sum()) }
                .sortedByDescending { finger -> finger.errors }
            ProgressResponse(
                sessions = anonymousProfileId?.let { trainingResultRepo.countByAnonymousProfileId(it) } ?: results.size,
                bestSpeedCpm = results.maxOf { result -> result.speedCpm },
                avgSpeedCpm = results.map { result -> result.speedCpm }.average(),
                avgAccuracy = results.map { result -> result.accuracy }.average(),
                masteryCpm = layoutProfiles.firstOrNull()?.masteryCpm ?: profile?.masteryCpm ?: results.firstOrNull()?.masteryCpm,
                weakFingers = weakFingers,
                recent = resultResponses(results.take(10)),
                gamification = profile?.let { gamificationService.toResponse(it, layoutProfiles) },
            )
        }

    private fun resultResponses(results: List<TrainingResultEntity>): List<TrainingResultResponse> {
        if (results.isEmpty()) {
            return emptyList()
        }
        val layouts = chordSetRepo.findAllById(results.map { result -> result.chordSetId }.toSet())
            .associate { chordSet -> chordSet.id to chordSet.layout }
        return results.map { result -> result.toResponse(layouts[result.chordSetId] ?: "UNKNOWN") }
    }

    private fun profileForSubject(subject: String): GamificationProfileEntity =
        gamificationProfileRepo.findByKeycloakSubject(subject)
            ?: gamificationProfileRepo.save(GamificationProfileEntity(keycloakSubject = subject))

    private fun profileForAnonymous(anonymousProfileId: Long): GamificationProfileEntity =
        gamificationProfileRepo.findByAnonymousProfileId(anonymousProfileId)
            ?: gamificationProfileRepo.save(GamificationProfileEntity(anonymousProfileId = anonymousProfileId))

    private fun layoutProfileForSubject(subject: String, layout: String): LayoutMasteryProfileEntity =
        layoutMasteryProfileRepo.findByKeycloakSubjectAndLayout(subject, layout)
            ?: layoutMasteryProfileRepo.save(LayoutMasteryProfileEntity(keycloakSubject = subject, layout = layout))

    private fun layoutProfileForAnonymous(anonymousProfileId: Long, layout: String): LayoutMasteryProfileEntity =
        layoutMasteryProfileRepo.findByAnonymousProfileIdAndLayout(anonymousProfileId, layout)
            ?: layoutMasteryProfileRepo.save(LayoutMasteryProfileEntity(anonymousProfileId = anonymousProfileId, layout = layout))

    private fun claimAnonymousLayoutMastery(subject: String, anonymousProfileId: Long) {
        val anonymousProfiles = layoutMasteryProfileRepo.findByAnonymousProfileIdOrderByLayoutAsc(anonymousProfileId)
        anonymousProfiles.forEach { anonymousLayoutProfile ->
            val subjectLayoutProfile = layoutProfileForSubject(subject, anonymousLayoutProfile.layout)
            if (anonymousLayoutProfile.masteryCpm >= subjectLayoutProfile.masteryCpm) {
                subjectLayoutProfile.masteryCpm = anonymousLayoutProfile.masteryCpm
                subjectLayoutProfile.baselineMasteryCpm = anonymousLayoutProfile.baselineMasteryCpm
                subjectLayoutProfile.leagueLevel = anonymousLayoutProfile.leagueLevel
                subjectLayoutProfile.calibrationSessionCount = anonymousLayoutProfile.calibrationSessionCount
                subjectLayoutProfile.calibrationMasteryTotal = anonymousLayoutProfile.calibrationMasteryTotal
                subjectLayoutProfile.calibrationCompletedAt = anonymousLayoutProfile.calibrationCompletedAt
                subjectLayoutProfile.trendJson = anonymousLayoutProfile.trendJson
            }
            subjectLayoutProfile.updatedAt = Instant.now()
            layoutMasteryProfileRepo.save(subjectLayoutProfile)
        }
        layoutMasteryProfileRepo.deleteAll(anonymousProfiles)
    }

    private fun requireChordSet(chordSetId: Long): ChordSetEntity =
        chordSetRepo.findById(chordSetId)
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Chord set not found.") }

    private fun upsertAnonymousProfile(
        rawDeviceId: String,
        servletRequest: HttpServletRequest,
        displayName: String?,
    ): AnonymousProfileEntity {
        val deviceId = normalizeDeviceId(rawDeviceId)
        val fingerprintHash = anonymousFingerprintService.fingerprintHash(servletRequest)
        val profile = anonymousProfileRepo.findByDeviceId(deviceId)
            ?: AnonymousProfileEntity(deviceId = deviceId, fingerprintHash = fingerprintHash)

        profile.fingerprintHash = fingerprintHash
        profile.lastSeenAt = Instant.now()
        if (displayName != null) {
            profile.displayName = displayName
        }
        return anonymousProfileRepo.save(profile)
    }

    private fun AnonymousProfileEntity.toResponse(): AnonymousProfileResponse =
        AnonymousProfileResponse(
            id = id,
            deviceId = deviceId,
            displayName = displayName,
            sessions = trainingResultRepo.countByAnonymousProfileId(id),
        )

    private fun focusLesson(
        saved: TrainingResultEntity,
        recentResults: List<TrainingResultEntity>,
        chordSet: ChordSetEntity,
    ): FocusLessonResponse? {
        val severeKeys = severeProblemKeys(saved)
        if (severeKeys.isNotEmpty()) {
            return buildFocusLesson(chordSet, "SEVERE", severeKeys)
        }

        val lessonsSinceFocus = recentResults.takeWhile { result -> result.lessonKind != "FOCUS" }
        val moderateKeys = moderateProblemKeys(lessonsSinceFocus.take(5))
        if (moderateKeys.isNotEmpty()) {
            return buildFocusLesson(chordSet, "MODERATE", moderateKeys)
        }

        return null
    }

    private fun severeProblemKeys(result: TrainingResultEntity): List<String> {
        val chordKeys = result.perChord
            .filterValues { errors -> errors >= 3 }
            .entries
        val charKeys = result.perChar
            .filterValues { errors -> errors >= 4 }
            .entries
        return (chordKeys + charKeys)
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { entry -> entry.value }.thenBy { entry -> entry.key })
            .map { entry -> entry.key }
            .distinct()
            .take(3)
    }

    private fun moderateProblemKeys(results: List<TrainingResultEntity>): List<String> {
        if (results.size < 3) {
            return emptyList()
        }

        val totals = mutableMapOf<String, Int>()
        val sessions = mutableMapOf<String, Int>()
        results.forEach { result ->
            mergeProblemMaps(result).forEach { (key, count) ->
                if (count > 0) {
                    totals[key] = (totals[key] ?: 0) + count
                    sessions[key] = (sessions[key] ?: 0) + 1
                }
            }
        }

        return totals.keys
            .filter { key ->
                val sessionCount = sessions[key] ?: 0
                sessionCount >= 3 || ((totals[key] ?: 0) >= 5 && sessionCount >= 2)
            }
            .sortedWith(compareByDescending<String> { key -> totals[key] ?: 0 }.thenBy { key -> key })
            .take(3)
    }

    private fun mergeProblemMaps(result: TrainingResultEntity): Map<String, Int> {
        val merged = mutableMapOf<String, Int>()
        (result.perChord.entries + result.perChar.entries).forEach { entry ->
            merged[entry.key] = (merged[entry.key] ?: 0) + entry.value
        }
        return merged
    }

    private fun buildFocusLesson(chordSet: ChordSetEntity, reason: String, problemKeys: List<String>): FocusLessonResponse {
        val cleanKeys = sanitizeProblemKeys(problemKeys)
        return FocusLessonResponse(
            sourceChordSetId = chordSet.id,
            layout = chordSet.layout,
            reason = reason,
            problemKeys = cleanKeys,
            chords = buildFocusChords(cleanKeys, chordSet.chords),
            title = "Focus: ${cleanKeys.joinToString(" ")}",
        )
    }

    private fun buildFocusChords(problemKeys: List<String>, fallbackChords: List<String>): List<String> {
        val combos = linkedSetOf<String>()
        problemKeys.forEach { key ->
            combos += key
            if (key.length == 1) {
                combos += key + key
            } else {
                combos += key.reversed()
                key.toList().forEach { char ->
                    combos += "$char$char"
                }
            }
        }
        problemKeys.forEach { left ->
            problemKeys.forEach { right ->
                if (left != right && left.length == 1 && right.length == 1) {
                    combos += left + right
                }
            }
        }

        val cleanedFallback = fallbackChords
            .asSequence()
            .map { chord -> chord.trim() }
            .filter { chord -> chord.isNotEmpty() }
            .distinct()
            .toList()
        if (combos.isEmpty()) {
            return repeatToFocusCount(cleanedFallback)
        }

        val problemLimit = focusChordCount / 2
        val problemPart = combos.take(problemLimit)
        val supportingPart = cleanedFallback
            .filterNot { chord -> chord in combos }
            .sortedWith(compareByDescending<String> { chord -> supportScore(chord, problemKeys) }.thenBy { chord -> chord })
        val mixed = mutableListOf<String>()
        var problemIndex = 0
        var supportIndex = 0
        while (mixed.size < focusChordCount && (problemIndex < problemPart.size || supportIndex < supportingPart.size)) {
            if (supportIndex < supportingPart.size) {
                mixed += supportingPart[supportIndex]
                supportIndex += 1
            }
            if (mixed.size < focusChordCount && problemIndex < problemPart.size) {
                mixed += problemPart[problemIndex]
                problemIndex += 1
            }
        }
        while (mixed.size < focusChordCount && cleanedFallback.isNotEmpty()) {
            mixed += cleanedFallback[mixed.size % cleanedFallback.size]
        }
        while (mixed.size < focusChordCount && problemPart.isNotEmpty()) {
            mixed += problemPart[mixed.size % problemPart.size]
        }
        return mixed.take(focusChordCount)
    }

    private fun repeatToFocusCount(chords: List<String>): List<String> {
        if (chords.isEmpty()) {
            return emptyList()
        }
        val repeated = mutableListOf<String>()
        while (repeated.size < focusChordCount) {
            chords.forEach { chord ->
                if (repeated.size < focusChordCount) {
                    repeated += chord
                }
            }
        }
        return repeated
    }

    private fun supportScore(chord: String, problemKeys: List<String>): Int =
        problemKeys.maxOfOrNull { key ->
            when {
                key.isNotEmpty() && chord.contains(key) -> 4
                key.length > 1 && (chord.startsWith(key.first()) || chord.endsWith(key.last())) -> 3
                key.any { char -> chord.contains(char) } -> 2
                else -> 0
            }
        } ?: 0

    private fun sanitizeErrorMap(values: Map<String, Int>): Map<String, Int> =
        values.asSequence()
            .map { (key, value) -> key.trim() to value }
            .filter { (key, value) -> key.length in 1..16 && value > 0 }
            .sortedWith(compareByDescending<Pair<String, Int>> { (_, value) -> value }.thenBy { (key) -> key })
            .take(maxMapEntries)
            .associate { (key, value) -> key to value.coerceAtMost(maxErrorsPerKey) }

    private fun sanitizeProblemKeys(values: List<String>): List<String> =
        values.asSequence()
            .map { value -> value.trim() }
            .filter { value -> value.length in 1..16 }
            .distinct()
            .take(maxProblemKeys)
            .toList()

    private fun normalizeDeviceId(value: String): String {
        val normalized = value.trim()
        if (normalized.length !in 8..128) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Anonymous device id is invalid.")
        }
        return normalized
    }

    private fun cleanDisplayName(value: String?): String? {
        val normalized = value?.trim()?.take(64)
        return normalized?.ifBlank { null }
    }

    private fun normalizeLessonKind(value: String): String {
        val normalized = value.trim().uppercase()
        if (normalized !in supportedLessonKinds) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported lesson kind.")
        }
        return normalized
    }

    private fun cleanClientResultId(value: String?): String? =
        value
            ?.trim()
            ?.take(128)
            ?.takeIf { candidate -> candidate.length >= 8 }

    private fun cleanPositiveDouble(value: Double, fallback: Double): Double =
        if (value.isFinite() && value >= 0.0) value else fallback.coerceAtLeast(0.0)

    private fun cleanRatio(value: Double): Double =
        when {
            !value.isFinite() -> 0.0
            value < 0.0 -> 0.0
            value > 1.0 -> 1.0
            else -> value
        }

    private fun cleanTimezone(value: String): String {
        val candidate = value.trim().take(64).ifBlank { "UTC" }
        return runCatching { ZoneId.of(candidate).id }.getOrDefault("UTC")
    }

    private fun parseLocalDate(value: String?, timezone: String): LocalDate? {
        if (!value.isNullOrBlank()) {
            return try {
                LocalDate.parse(value.trim())
            } catch (_: DateTimeParseException) {
                null
            }
        }
        return runCatching { LocalDate.now(ZoneId.of(cleanTimezone(timezone))) }.getOrNull()
    }

    private fun windowMetricsJson(values: Map<String, Double>): String =
        objectMapper.writeValueAsString(
            values.entries
                .asSequence()
                .filter { (key, value) -> key.length in 1..64 && value.isFinite() }
                .take(64)
                .associate { (key, value) -> key to roundOne(value) },
        ).take(4000)

    private fun practiceContextJson(values: Map<String, Any?>): String =
        objectMapper.writeValueAsString(sanitizePracticeContext(values)).take(2048)

    private fun sanitizePracticeContext(values: Map<String, Any?>): Map<String, Any?> =
        values.entries
            .asSequence()
            .filter { (key) -> key.length in 1..64 }
            .take(16)
            .associate { (key, value) -> key to sanitizePracticeContextValue(value) }
            .filterValues { value -> value != null }

    private fun sanitizePracticeContextValue(value: Any?): Any? =
        when (value) {
            is String -> value.trim().take(160).ifBlank { null }
            is Number -> value
            is Boolean -> value
            is List<*> -> value
                .mapNotNull { item -> sanitizePracticeContextValue(item) }
                .take(16)
            else -> null
        }

    private fun roundOne(value: Double): Double = round(value * 10.0) / 10.0

    private companion object {
        val objectMapper: ObjectMapper = jacksonObjectMapper()
        val supportedLessonKinds = setOf("CALIBRATION", "STANDARD", "FOCUS")
        const val maxMapEntries = 32
        const val maxProblemKeys = 8
        const val maxErrorsPerKey = 999
        const val focusChordCount = 32
    }
}
