package com.playsay.keyboard.service

import com.playsay.keyboard.dto.AnonymousProfileResponse
import com.playsay.keyboard.dto.ClaimAnonymousProgressRequest
import com.playsay.keyboard.dto.ClaimAnonymousProgressResponse
import com.playsay.keyboard.dto.FingerErrorsResponse
import com.playsay.keyboard.dto.FocusLessonResponse
import com.playsay.keyboard.dto.ProgressResponse
import com.playsay.keyboard.dto.ResolveAnonymousProfileRequest
import com.playsay.keyboard.dto.SubmitAnonymousResultRequest
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.dto.TrainingResultResponse
import com.playsay.keyboard.dto.UpdateAnonymousProfileRequest
import com.playsay.keyboard.entity.AnonymousProfileEntity
import com.playsay.keyboard.entity.ChordSetEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.mapper.toResponse
import com.playsay.keyboard.repo.AnonymousProfileRepo
import com.playsay.keyboard.repo.ChordSetRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Instant

@Service
class TrainingService(
    private val chordSetRepo: ChordSetRepo,
    private val trainingResultRepo: TrainingResultRepo,
    private val anonymousProfileRepo: AnonymousProfileRepo,
    private val anonymousFingerprintService: AnonymousFingerprintService,
) {
    @Transactional
    fun submit(subject: String, request: SubmitResultRequest): TrainingResultResponse {
        val chordSet = requireChordSet(request.chordSetId)
        val saved = trainingResultRepo.save(
            TrainingResultEntity(
                keycloakSubject = subject,
                chordSetId = request.chordSetId,
                lessonKind = normalizeLessonKind(request.lessonKind),
                speedCpm = request.speedCpm,
                accuracy = request.accuracy,
                errors = request.errors,
                durationMs = request.durationMs,
                perFinger = sanitizeErrorMap(request.perFinger),
                perChar = sanitizeErrorMap(request.perChar),
                perChord = sanitizeErrorMap(request.perChord),
                focusProblemKeys = sanitizeProblemKeys(request.focusProblemKeys),
            ),
        )
        val recent = trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc(subject)
        return saved.toResponse().copy(focusLesson = focusLesson(saved, recent, chordSet))
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
    fun submitAnonymous(request: SubmitAnonymousResultRequest, servletRequest: HttpServletRequest): TrainingResultResponse {
        val chordSet = requireChordSet(request.chordSetId)
        val profile = upsertAnonymousProfile(request.deviceId, servletRequest, cleanDisplayName(request.displayName))
        val saved = trainingResultRepo.save(
            TrainingResultEntity(
                anonymousProfileId = profile.id,
                chordSetId = request.chordSetId,
                lessonKind = normalizeLessonKind(request.lessonKind),
                speedCpm = request.speedCpm,
                accuracy = request.accuracy,
                errors = request.errors,
                durationMs = request.durationMs,
                perFinger = sanitizeErrorMap(request.perFinger),
                perChar = sanitizeErrorMap(request.perChar),
                perChord = sanitizeErrorMap(request.perChord),
                focusProblemKeys = sanitizeProblemKeys(request.focusProblemKeys),
            ),
        )
        val recent = trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id)
        return saved.toResponse().copy(focusLesson = focusLesson(saved, recent, chordSet))
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
        if (results.isEmpty()) {
            return ProgressResponse(
                sessions = 0,
                bestSpeedCpm = 0.0,
                avgSpeedCpm = 0.0,
                avgAccuracy = 0.0,
                weakFingers = emptyList(),
                recent = emptyList(),
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
            weakFingers = weakFingers,
            recent = results.take(10).map { result -> result.toResponse() },
        )
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

    private companion object {
        val supportedLessonKinds = setOf("STANDARD", "FOCUS")
        const val maxMapEntries = 32
        const val maxProblemKeys = 8
        const val maxErrorsPerKey = 999
        const val focusChordCount = 18
    }
}
