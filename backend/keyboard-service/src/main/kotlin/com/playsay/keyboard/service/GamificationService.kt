package com.playsay.keyboard.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.keyboard.dto.GamificationEventResponse
import com.playsay.keyboard.dto.GamificationProfileResponse
import com.playsay.keyboard.dto.LayoutMasteryProfileResponse
import com.playsay.keyboard.entity.GamificationEventEntity
import com.playsay.keyboard.entity.GamificationProfileEntity
import com.playsay.keyboard.entity.LayoutMasteryProfileEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.repo.GamificationEventRepo
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.LocalDate
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

@Service
class GamificationService(
    private val gamificationProfileRepo: GamificationProfileRepo,
    private val gamificationEventRepo: GamificationEventRepo,
    private val layoutMasteryProfileRepo: LayoutMasteryProfileRepo,
) {
    fun updateProfileBeforeSave(
        profile: GamificationProfileEntity,
        layoutProfile: LayoutMasteryProfileEntity,
        masteryCpm: Double,
        accuracy: Double,
        cadence: Double,
        lessonKind: String,
        localDate: LocalDate?,
    ) {
        updateCalibrationAndLeague(layoutProfile, masteryCpm, accuracy, cadence, lessonKind)
        localDate?.let { updateStreak(profile, it) }
        profile.updatedAt = Instant.now()
        layoutProfile.updatedAt = Instant.now()
        layoutMasteryProfileRepo.save(layoutProfile)
        gamificationProfileRepo.save(profile)
    }

    fun eventsAfterSave(
        profile: GamificationProfileEntity,
        layoutProfile: LayoutMasteryProfileEntity,
        result: TrainingResultEntity,
    ): List<GamificationEventEntity> {
        val events = mutableListOf<GamificationEventEntity>()
        if (result.masteryDelta > 0) {
            events += event(profile, result, "MASTERY_UP", mapOf("delta" to result.masteryDelta.toString(), "layout" to layoutProfile.layout))
        }
        if (layoutProfile.calibrationCompletedAt != null && layoutProfile.calibrationSessionCount == calibrationTarget) {
            val alreadyEmitted = gamificationEventRepo
                .findByOwner(profile)
                .any { existing -> existing.eventType == "CALIBRATION_COMPLETE" && readStringMap(existing.payloadJson)["layout"] == layoutProfile.layout }
            if (!alreadyEmitted) {
                events += event(
                    profile,
                    result,
                    "CALIBRATION_COMPLETE",
                    mapOf("masteryCpm" to layoutProfile.masteryCpm.toString(), "layout" to layoutProfile.layout),
                )
            }
        }
        if (result.masteryCpm != null && layoutProfile.leagueLevel != null) {
            events += event(
                profile,
                result,
                "LEAGUE_PROGRESS",
                mapOf("leagueLevel" to layoutProfile.leagueLevel.toString(), "layout" to layoutProfile.layout),
            )
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

    fun emptyProfile(): GamificationProfileEntity = GamificationProfileEntity()

    fun toResponse(
        profile: GamificationProfileEntity,
        layoutProfiles: List<LayoutMasteryProfileEntity> = emptyList(),
        activeLayout: String? = null,
    ): GamificationProfileResponse {
        val layoutResponses = layoutProfiles
            .sortedBy { layoutProfile -> layoutProfile.layout }
            .associate { layoutProfile -> layoutProfile.layout to layoutToResponse(layoutProfile) }
        val active = activeLayout
            ?.let { layout -> layoutProfiles.firstOrNull { layoutProfile -> layoutProfile.layout == layout } }
            ?: layoutProfiles.firstOrNull()

        return GamificationProfileResponse(
            calibrated = active?.baselineMasteryCpm != null,
            calibrationSessions = active?.calibrationSessionCount?.coerceIn(0, calibrationTarget) ?: 0,
            calibrationTarget = calibrationTarget,
            masteryCpm = active?.masteryCpm ?: profile.masteryCpm,
            baselineMasteryCpm = active?.baselineMasteryCpm,
            leagueLevel = active?.leagueLevel,
            leagueProgress = active?.let { leagueProgress(it.masteryCpm) } ?: 0,
            currentStreak = profile.currentStreak,
            bestStreak = profile.bestStreak,
            streakFreezes = profile.streakFreezes,
            lastTrainingDate = profile.lastTrainingDate?.toString(),
            trend = active?.let { readDoubleList(it.trendJson) } ?: emptyList(),
            achievements = readStringList(profile.achievementsJson),
            layoutMastery = layoutResponses,
            activeLayoutMastery = active?.let { layoutToResponse(it) },
        )
    }

    fun layoutToResponse(profile: LayoutMasteryProfileEntity): LayoutMasteryProfileResponse =
        LayoutMasteryProfileResponse(
            layout = profile.layout,
            calibrated = profile.baselineMasteryCpm != null,
            calibrationSessions = profile.calibrationSessionCount.coerceIn(0, calibrationTarget),
            calibrationTarget = calibrationTarget,
            masteryCpm = profile.masteryCpm,
            baselineMasteryCpm = profile.baselineMasteryCpm,
            leagueLevel = profile.leagueLevel,
            leagueProgress = leagueProgress(profile.masteryCpm),
            trend = readDoubleList(profile.trendJson),
        )

    fun eventToResponse(event: GamificationEventEntity): GamificationEventResponse =
        GamificationEventResponse(
            id = event.id,
            type = event.eventType,
            payload = readStringMap(event.payloadJson),
            createdAt = event.createdAt.toString(),
        )

    private fun updateCalibrationAndLeague(
        profile: LayoutMasteryProfileEntity,
        masteryCpm: Double,
        accuracy: Double,
        cadence: Double,
        lessonKind: String,
    ) {
        if (profile.baselineMasteryCpm == null && lessonKind in calibrationLessonKinds) {
            profile.calibrationSessionCount = (profile.calibrationSessionCount + 1).coerceAtMost(calibrationTarget)
            profile.calibrationMasteryTotal += masteryCpm
            if (profile.calibrationSessionCount >= calibrationTarget) {
                profile.baselineMasteryCpm = roundOne(profile.calibrationMasteryTotal / profile.calibrationSessionCount)
                profile.calibrationCompletedAt = Instant.now()
                profile.leagueLevel = leagueLevel(profile.baselineMasteryCpm ?: masteryCpm, accuracy, cadence)
            }
            return
        }

        if (profile.baselineMasteryCpm != null) {
            val computedLeague = leagueLevel(masteryCpm, accuracy, cadence)
            profile.leagueLevel = max(profile.leagueLevel ?: 0, computedLeague)
        }
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

    private fun achievementCodes(result: TrainingResultEntity, profile: GamificationProfileEntity): List<String> =
        buildList {
            if (result.averageCpm >= 100) add("FIRST_HUNDRED")
            if (result.accuracy >= 1.0 && result.characterCount >= 200) add("SNIPER")
            if (result.cadence >= 0.8) add("METRONOME")
            if (profile.currentStreak >= 7) add("STREAK_7")
            if (profile.currentStreak >= 30) add("STREAK_30")
        }

    private fun leagueLevel(masteryCpm: Double, accuracy: Double, cadence: Double): Int =
        when {
            masteryCpm >= 450 && accuracy >= 0.98 && cadence >= 0.70 -> 5
            masteryCpm >= 350 && accuracy >= 0.97 && cadence >= 0.65 -> 4
            masteryCpm >= 250 && accuracy >= 0.95 && cadence >= 0.60 -> 3
            masteryCpm >= 180 && accuracy >= 0.93 && cadence >= 0.50 -> 2
            masteryCpm >= 100 && accuracy >= 0.88 -> 1
            else -> 0
        }

    private fun leagueProgress(masteryCpm: Double): Int {
        val next = listOf(100.0, 180.0, 250.0, 350.0, 450.0).firstOrNull { threshold -> threshold > masteryCpm } ?: return 100
        val previous = listOf(0.0, 100.0, 180.0, 250.0, 350.0).last { threshold -> threshold < next }
        return (((masteryCpm - previous) / (next - previous)) * 100).toInt().coerceIn(0, 100)
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

    private fun GamificationEventRepo.findByOwner(profile: GamificationProfileEntity): List<GamificationEventEntity> =
        profile.keycloakSubject?.let { findByKeycloakSubjectOrderByCreatedAtDesc(it) }
            ?: profile.anonymousProfileId?.let { findByAnonymousProfileIdOrderByCreatedAtDesc(it) }
            ?: emptyList()

    private fun roundOne(value: Double): Double = round(value * 10.0) / 10.0

    private fun readDoubleList(value: String): List<Double> =
        runCatching { objectMapper.readValue(value, doubleListType) }.getOrDefault(emptyList())

    private fun readStringList(value: String): List<String> =
        runCatching { objectMapper.readValue(value, stringListType) }.getOrDefault(emptyList())

    private fun readStringMap(value: String): Map<String, String> =
        runCatching { objectMapper.readValue(value, stringMapType) }.getOrDefault(emptyMap())

    private fun stringListJson(values: List<String>): String =
        objectMapper.writeValueAsString(values)

    companion object {
        const val calibrationTarget = 3
        private val calibrationLessonKinds = setOf("CALIBRATION", "STANDARD")
        private val objectMapper: ObjectMapper = jacksonObjectMapper()
        private val doubleListType = object : TypeReference<List<Double>>() {}
        private val stringListType = object : TypeReference<List<String>>() {}
        private val stringMapType = object : TypeReference<Map<String, String>>() {}
    }
}
