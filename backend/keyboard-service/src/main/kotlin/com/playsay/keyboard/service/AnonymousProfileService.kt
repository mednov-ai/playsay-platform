package com.playsay.keyboard.service

import com.playsay.keyboard.dto.AnonymousProfileResponse
import com.playsay.keyboard.entity.AnonymousProfileEntity
import com.playsay.keyboard.repo.AnonymousProfileRepo
import com.playsay.keyboard.repo.GamificationEventRepo
import com.playsay.keyboard.repo.GamificationProfileRepo
import com.playsay.keyboard.repo.LayoutMasteryProfileRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import jakarta.servlet.http.HttpServletRequest
import java.time.Instant
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

@Component
class AnonymousProfileService(
    private val anonymousProfileRepo: AnonymousProfileRepo,
    private val gamificationEventRepo: GamificationEventRepo,
    private val gamificationProfileRepo: GamificationProfileRepo,
    private val layoutMasteryProfileRepo: LayoutMasteryProfileRepo,
    private val trainingResultRepo: TrainingResultRepo,
    private val anonymousFingerprintService: AnonymousFingerprintService,
) {
    fun resolve(deviceId: String, servletRequest: HttpServletRequest): AnonymousProfileResponse =
        upsert(deviceId, servletRequest, displayName = null).toResponse()

    fun update(deviceId: String, displayName: String?, servletRequest: HttpServletRequest): AnonymousProfileResponse =
        upsert(deviceId, servletRequest, cleanDisplayName(displayName)).toResponse()

    fun reset(rawDeviceId: String) {
        val profile = find(rawDeviceId) ?: return
        val events = gamificationEventRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id)
        val layoutProfiles = layoutMasteryProfileRepo.findByAnonymousProfileIdOrderByLayoutAsc(profile.id)
        val gamificationProfile = gamificationProfileRepo.findByAnonymousProfileId(profile.id)
        val results = trainingResultRepo.findByAnonymousProfileIdOrderByCreatedAtDesc(profile.id)
        gamificationEventRepo.deleteAll(events)
        layoutMasteryProfileRepo.deleteAll(layoutProfiles)
        if (gamificationProfile != null) gamificationProfileRepo.delete(gamificationProfile)
        trainingResultRepo.deleteAll(results)
        anonymousProfileRepo.delete(profile)
    }

    fun find(rawDeviceId: String): AnonymousProfileEntity? =
        anonymousProfileRepo.findByDeviceId(normalizeDeviceId(rawDeviceId))

    fun upsert(
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
        if (displayName != null) profile.displayName = displayName
        return anonymousProfileRepo.save(profile)
    }

    private fun AnonymousProfileEntity.toResponse(): AnonymousProfileResponse =
        AnonymousProfileResponse(
            id = id,
            deviceId = deviceId,
            displayName = displayName,
            sessions = trainingResultRepo.countByAnonymousProfileId(id),
        )

    private fun normalizeDeviceId(value: String): String {
        val normalized = value.trim()
        if (normalized.length !in 8..128) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Anonymous device id is invalid.")
        }
        return normalized
    }

    private fun cleanDisplayName(value: String?): String? = value?.trim()?.take(64)?.ifBlank { null }
}
