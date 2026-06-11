package com.playsay.keyboard.service

import com.fasterxml.jackson.core.type.TypeReference
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
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.mapper.toResponse
import com.playsay.keyboard.repo.AnonymousProfileRepo
import com.playsay.keyboard.repo.ChordSetRepo
import com.playsay.keyboard.repo.GamificationEventRepo
import com.playsay.keyboard.repo.GamificationProfileRepo
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
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

@Service
class TrainingService(
    private val chordSetRepo: ChordSetRepo,
    private val trainingResultRepo: TrainingResultRepo,
    private val gamificationProfileRepo: GamificationProfileRepo,
    private val gamificationEventRepo: GamificationEventRepo,
    private val anonymousProfileRepo: AnonymousProfileRepo,
    private val anonymousFingerprintService: AnonymousFingerprintService,
    private val techniqueAdviceService: TechniqueAdviceService,
) {
    @Transactional
    fun submit(subject: String, request: SubmitResultRequest): SubmitTrainingResultResponse {
        val chordSet = requireChordSet(request.chordSetId)
        cleanClientResultId(request.clientResultId)?.let { clientResultId ->
            val existing = trainingResultRepo.findByKeycloakSubjectAndClientResultId(subject, clientResultId)
            if (existing != null) {
                return submitResponse(existing, subject, null, emptyList(), chordSet)
            }
        }
        val profile = profileForSubject(subject)
        val mastery = updateMastery(profile, request.averageCpm, request.accuracy, request.cadence, request.lessonKind, parseLocalDate(request.localTrainingDate, request.clientTimezone))
        val saved = trainingResultRepo.save(
            TrainingResultEntity(
                clientResultId = cleanClientResultId(request.clientResultId),
                keycloakSubject = subject,
                chordSetId = request.chordSetId,
                lessonKind = normalizeLessonKind(request.lessonKind),
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
                clientTimezone = cleanTimezone(request.clientTimezone),
                localTrainingDate = parseLocalDate(request.localTrainingDate, request.clientTimezone),
                perFinger = sanitizeErrorMap(request.perFinger),
                perChar = sanitizeErrorMap(request.perChar),
                perChord = sanitizeErrorMap(request.perChord),
                focusProblemKeys = sanitizeProblemKeys(request.focusProblemKeys),
            ),
        )
        val events = updateGamificationAfterSave(profile, saved)
        val recent = trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc(subject)
        return submitResponse(saved, subject, null, events, chordSet, recent)
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
    fun submitAnonymous(request: SubmitAnonymousResultRequest, servletRequest: HttpServletRequest): SubmitTrainingResultResponse {
        val chordSet = requireChordSet(request.chordSetId)
        val profile = upsertAnonymousProfile(request.deviceId, servletRequest, cleanDisplayName(request.displayName))
        cleanClientResultId(request.clientResultId)?.let { clientResultId ->
            val existing = trainingResultRepo.findByAnonymousProfileIdAndClientResultId(profile.id, clientResultId)
            if (existing != null) {
                return submitResponse(existing, null, profile.id, emptyList(), chordSet)
            }
        }
        val gamificationProfile = profileForAnonymous(profile.id)
        val mastery = updateMastery(gamificationProfile, request.averageCpm, request.accuracy, request.cadence, request.lessonKind, parseLocalDate(request.localTrainingDate, request.clientTimezone))
        val saved = trainingResultRepo.save(
            TrainingResultEntity(
                clientResultId = cleanClientResultId(request.clientResultId),
                anonymousProfileId = profile.id,
                chordSetId = request.chordSetId,
                lessonKind = normalizeLessonKind(request.lessonKind),
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
                clientTimezone = cleanTimezone(request.clientTimezone),
                localTrainingDate = parseLocalDate(request.localTrainingDate, request.clientTimezone),
                perFinger = sanitizeErrorMap(request.perFinger),
                perChar = sanitizeErrorMap(request.perChar),
                perChord = sanitizeErrorMap(request.perChord),
                focusProblemKeys = sanitizeProblemKeys(request.focusProblemKeys),
            ),
        )
        val events = updateGamificationAfterSave(gamificationProfile, saved)
        val recent = trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id)
        return submitResponse(saved, null, profile.id, events, chordSet, recent)
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
        return ClaimAnonymousProgressResponse(
            claimedResults = anonymousResults.size,
            progress = progress(subject),
        )
    }

    @Transactional(readOnly = true)
    fun progress(subject: String): ProgressResponse {
        val results = trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc(subject)
        val gamification = gamificationProfileRepo.findByKeycloakSubject(subject)
        if (results.isEmpty()) {
            return ProgressResponse(
                sessions = 0,
                bestSpeedCpm = 0.0,
                avgSpeedCpm = 0.0,
                avgAccuracy = 0.0,
                masteryCpm = gamification?.masteryCpm,
                weakFingers = emptyList(),
                recent = emptyList(),
                gamification = gamification?.toResponse(),
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
            masteryCpm = gamification?.masteryCpm ?: results.firstOrNull()?.masteryCpm,
            weakFingers = weakFingers,
            recent = results.take(10).map { result -> result.toResponse() },
            gamification = gamification?.toResponse(),
        )
    }

    private fun submitResponse(
        saved: TrainingResultEntity,
        subject: String?,
        anonymousProfileId: Long?,
        events: List<GamificationEventEntity>,
        chordSet: ChordSetEntity,
        recentOverride: List<TrainingResultEntity>? = null,
    ): SubmitTrainingResultResponse {
        val recent = recentOverride
            ?: subject?.let { trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc(it) }
            ?: anonymousProfileId?.let { trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(it) }
            ?: emptyList()
        val focusLesson = focusLesson(saved, recent, chordSet)
        val profile = subject?.let { gamificationProfileRepo.findByKeycloakSubject(it) }
            ?: anonymousProfileId?.let { gamificationProfileRepo.findByAnonymousProfileId(it) }
        val progress = subject?.let { progress(it) }
            ?: anonymousProgress(anonymousProfileId, recent, profile)
        return SubmitTrainingResultResponse(
            trainingResult = saved.toResponse().copy(focusLesson = focusLesson),
            progress = progress,
            gamification = (profile ?: emptyProfile()).toResponse(),
            events = events.map { event -> event.toResponse() },
            techniqueAdvice = techniqueAdviceService.advice(saved, recent),
        )
    }

    private fun anonymousProgress(
        anonymousProfileId: Long?,
        results: List<TrainingResultEntity>,
        profile: GamificationProfileEntity?,
    ): ProgressResponse =
        if (results.isEmpty()) {
            ProgressResponse(
                sessions = 0,
                bestSpeedCpm = 0.0,
                avgSpeedCpm = 0.0,
                avgAccuracy = 0.0,
                masteryCpm = profile?.masteryCpm,
                weakFingers = emptyList(),
                recent = emptyList(),
                gamification = profile?.toResponse(),
            )
        } else {
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
                masteryCpm = profile?.masteryCpm ?: results.firstOrNull()?.masteryCpm,
                weakFingers = weakFingers,
                recent = results.take(10).map { result -> result.toResponse() },
                gamification = profile?.toResponse(),
            )
        }

    private fun profileForSubject(subject: String): GamificationProfileEntity =
        gamificationProfileRepo.findByKeycloakSubject(subject)
            ?: gamificationProfileRepo.save(GamificationProfileEntity(keycloakSubject = subject))

    private fun profileForAnonymous(anonymousProfileId: Long): GamificationProfileEntity =
        gamificationProfileRepo.findByAnonymousProfileId(anonymousProfileId)
            ?: gamificationProfileRepo.save(GamificationProfileEntity(anonymousProfileId = anonymousProfileId))

    private fun emptyProfile(): GamificationProfileEntity = GamificationProfileEntity()

    private fun updateMastery(
        profile: GamificationProfileEntity,
        averageCpm: Double,
        accuracy: Double,
        cadence: Double,
        lessonKind: String,
        localDate: LocalDate?,
    ): MasteryUpdate {
        val cleanAverage = cleanPositiveDouble(averageCpm, 0.0)
        val cleanAccuracy = cleanRatio(accuracy)
        val cleanCadence = cleanRatio(cadence)
        val qualityMultiplier = (0.55 + 0.45 * cleanCadence) * (0.7 + 0.3 * cleanAccuracy)
        val effectiveTempo = cleanAverage * qualityMultiplier
        val previous = profile.masteryCpm.takeIf { value -> value > 0.0 }
        val alpha = when {
            previous == null -> 1.0
            effectiveTempo < previous && (cleanCadence < 0.55 || cleanAccuracy < 0.93) -> 0.34
            cleanCadence >= 0.75 && cleanAccuracy >= 0.96 -> 0.42
            cleanCadence >= 0.65 && cleanAccuracy >= 0.93 -> 0.28
            else -> 0.18
        }
        val next = previous?.let { value -> value + (effectiveTempo - value) * alpha } ?: effectiveTempo
        val roundedNext = roundOne(next)
        val delta = previous?.let { roundOne(roundedNext - it) } ?: 0.0

        profile.masteryCpm = roundedNext
        profile.updatedAt = Instant.now()
        profile.trendJson = trendJson(readDoubleList(profile.trendJson) + roundedNext)
        val normalizedLessonKind = normalizeLessonKind(lessonKind)
        if (profile.baselineMasteryCpm == null && normalizedLessonKind == "CALIBRATION") {
            profile.baselineMasteryCpm = roundedNext
            profile.leagueLevel = leagueLevel(roundedNext, cleanAccuracy, cleanCadence)
        } else if (profile.baselineMasteryCpm != null) {
            val computedLeague = leagueLevel(roundedNext, cleanAccuracy, cleanCadence)
            profile.leagueLevel = max(profile.leagueLevel ?: 0, computedLeague)
        }
        localDate?.let { updateStreak(profile, it) }
        gamificationProfileRepo.save(profile)
        return MasteryUpdate(masteryCpm = roundedNext, masteryDelta = delta)
    }

    private fun updateGamificationAfterSave(
        profile: GamificationProfileEntity,
        result: TrainingResultEntity,
    ): List<GamificationEventEntity> {
        val events = mutableListOf<GamificationEventEntity>()
        if (result.masteryDelta > 0) {
            events += event(profile, result, "MASTERY_UP", mapOf("delta" to result.masteryDelta.toString()))
        }
        if (result.lessonKind == "CALIBRATION" && profile.baselineMasteryCpm != null) {
            events += event(profile, result, "CALIBRATION_COMPLETE", mapOf("masteryCpm" to profile.masteryCpm.toString()))
        }
        if (result.masteryCpm != null && profile.leagueLevel != null) {
            events += event(profile, result, "LEAGUE_PROGRESS", mapOf("leagueLevel" to profile.leagueLevel.toString()))
        }
        val achievements = readStringList(profile.achievementsJson).toMutableSet()
        val newAchievements = achievementCodes(result, profile).filter { code -> achievements.add(code) }
        if (newAchievements.isNotEmpty()) {
            profile.achievementsJson = stringListJson(achievements.toList().sorted())
            profile.updatedAt = Instant.now()
            gamificationProfileRepo.save(profile)
            newAchievements.forEach { code ->
                events += event(profile, result, "ACHIEVEMENT_UNLOCKED", mapOf("code" to code))
            }
        }
        return gamificationEventRepo.saveAll(events).toList()
    }

    private fun achievementCodes(result: TrainingResultEntity, profile: GamificationProfileEntity): List<String> =
        buildList {
            if (result.averageCpm >= 100) add("FIRST_HUNDRED")
            if (result.accuracy >= 1.0 && result.characterCount >= 200) add("SNIPER")
            if (result.cadence >= 0.8) add("METRONOME")
            if (profile.currentStreak >= 7) add("STREAK_7")
            if (profile.currentStreak >= 30) add("STREAK_30")
        }

    private fun updateStreak(profile: GamificationProfileEntity, date: LocalDate) {
        val previous = profile.lastTrainingDate
        if (previous == date) {
            return
        }
        profile.currentStreak = when {
            previous == null -> 1
            previous.plusDays(1) == date -> profile.currentStreak + 1
            previous.plusDays(2) == date && profile.streakFreezes > 0 -> {
                profile.streakFreezes -= 1
                profile.currentStreak + 1
            }
            else -> 1
        }
        profile.bestStreak = max(profile.bestStreak, profile.currentStreak)
        profile.streakFreezes = min(max(profile.streakFreezes, 0) + (profile.currentStreak / 7), 2)
        profile.lastTrainingDate = date
    }

    private fun event(
        profile: GamificationProfileEntity,
        result: TrainingResultEntity,
        type: String,
        payload: Map<String, String>,
    ): GamificationEventEntity =
        GamificationEventEntity(
            keycloakSubject = profile.keycloakSubject,
            anonymousProfileId = profile.anonymousProfileId,
            trainingResultId = result.id.takeIf { it > 0 },
            eventType = type,
            payloadJson = objectMapper.writeValueAsString(payload),
        )

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
            return cleanedFallback.take(18)
        }

        val problemLimit = focusChordCount / 2
        val problemPart = combos.take(problemLimit)
        val supportingPart = cleanedFallback.filterNot { chord -> chord in combos }
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

    private fun roundOne(value: Double): Double = round(value * 10.0) / 10.0

    private fun leagueLevel(masteryCpm: Double, accuracy: Double, cadence: Double): Int =
        when {
            masteryCpm >= 450 && accuracy >= 0.98 && cadence >= 0.75 -> 5
            masteryCpm >= 350 && accuracy >= 0.97 && cadence >= 0.68 -> 4
            masteryCpm >= 250 && accuracy >= 0.96 && cadence >= 0.62 -> 3
            masteryCpm >= 180 && accuracy >= 0.94 && cadence >= 0.55 -> 2
            masteryCpm >= 100 && accuracy >= 0.90 -> 1
            else -> 0
        }

    private fun GamificationProfileEntity.toResponse(): GamificationProfileResponse =
        GamificationProfileResponse(
            calibrated = baselineMasteryCpm != null,
            masteryCpm = masteryCpm,
            baselineMasteryCpm = baselineMasteryCpm,
            leagueLevel = leagueLevel,
            currentStreak = currentStreak,
            bestStreak = bestStreak,
            streakFreezes = streakFreezes,
            lastTrainingDate = lastTrainingDate?.toString(),
            trend = readDoubleList(trendJson),
            achievements = readStringList(achievementsJson),
        )

    private fun GamificationEventEntity.toResponse(): GamificationEventResponse =
        GamificationEventResponse(
            id = id,
            type = eventType,
            payload = readStringMap(payloadJson),
            createdAt = createdAt.toString(),
        )

    private fun readDoubleList(value: String): List<Double> =
        runCatching { objectMapper.readValue(value, doubleListType) }.getOrDefault(emptyList())

    private fun readStringList(value: String): List<String> =
        runCatching { objectMapper.readValue(value, stringListType) }.getOrDefault(emptyList())

    private fun readStringMap(value: String): Map<String, String> =
        runCatching { objectMapper.readValue(value, stringMapType) }.getOrDefault(emptyMap())

    private fun trendJson(values: List<Double>): String =
        objectMapper.writeValueAsString(values.takeLast(10))

    private fun stringListJson(values: List<String>): String =
        objectMapper.writeValueAsString(values)

    private data class MasteryUpdate(
        val masteryCpm: Double,
        val masteryDelta: Double,
    )

    private companion object {
        val objectMapper: ObjectMapper = jacksonObjectMapper()
        val doubleListType = object : TypeReference<List<Double>>() {}
        val stringListType = object : TypeReference<List<String>>() {}
        val stringMapType = object : TypeReference<Map<String, String>>() {}
        val supportedLessonKinds = setOf("CALIBRATION", "STANDARD", "FOCUS")
        const val maxMapEntries = 32
        const val maxProblemKeys = 8
        const val maxErrorsPerKey = 999
        const val focusChordCount = 18
    }
}
