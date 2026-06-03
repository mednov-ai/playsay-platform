package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.playsay.gateway.dto.MaterialVideoPlaybackRequest
import com.playsay.gateway.dto.MaterialVideoPlaybackResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.utils.MetaData
import jakarta.servlet.http.HttpServletRequest
import java.time.Clock
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component

@Component
class MaterialVideoPlaybackService(
    private val materialCatalogService: LessonMaterialCatalogService,
    private val userProfileStore: UserProfileStore,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val lessonRepo: LessonRepo,
    @param:Value("\${playsay.video.youtube.rf-relay.enabled:false}")
    private val rfRelayEnabled: Boolean,
    @param:Value("\${playsay.video.youtube.rf-relay.geo-country-header:}")
    private val geoCountryHeader: String,
    @param:Value("\${playsay.video.youtube.rf-relay.session-ttl-seconds:900}")
    private val sessionTtlSeconds: Long,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val sessions = ConcurrentHashMap<UUID, YoutubePlaybackSession>()

    fun playback(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: MaterialVideoPlaybackRequest,
        servletRequest: HttpServletRequest,
    ): MaterialVideoPlaybackResponse {
        val profile = userProfileStore.current(authentication)
        val currentUserId = userProfileStore.currentUserId(authentication)
        val materialRow = materialCatalogService.find(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        if (materialRow.status == MetaData.MaterialStatuses.ARCHIVED || !canAccessMaterial(authentication, materialRow, currentUserId, profile.subject)) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        val material = materialCatalogService.toResponse(materialRow)
        val document = material.document
        val block = findBlock(document, request.blockId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val provider = block.path("provider").asText("").uppercase()
        if (block.path("type").asText("") != "videoEmbed" || provider != "YOUTUBE") {
            return response(materialId, request.blockId, null, "BLOCKED", "YOUTUBE_BLOCK_REQUIRED", null)
        }

        val meta = YoutubeVideoSupport.metaFromBlock(block)
            ?: return response(materialId, request.blockId, null, "NEEDS_REVIEW", "YOUTUBE_METADATA_MISSING", null)
        val embedUrl = YoutubeVideoSupport.embedUrl(meta.videoId)
        val policy = YoutubeVideoSupport.videoMeetsPolicy(meta)
        if (!policy.approved) {
            return response(materialId, request.blockId, meta.videoId, "NEEDS_REVIEW", policy.reason, embedUrl)
        }

        val ipCountry = resolveIpCountry(servletRequest)
        val profileCountry = profile.countryCode?.uppercase()
        if (!rfRelayEnabled) {
            return response(materialId, request.blockId, meta.videoId, "EMBED", "RF_RELAY_DISABLED", embedUrl)
        }
        if (profileCountry != "RU") {
            return response(materialId, request.blockId, meta.videoId, "EMBED", "PROFILE_COUNTRY_NOT_RU", embedUrl)
        }
        if (ipCountry != "RU") {
            val reason = if (ipCountry == null) "IP_COUNTRY_UNKNOWN" else "PROFILE_IP_COUNTRY_MISMATCH"
            return response(materialId, request.blockId, meta.videoId, "EMBED", reason, embedUrl)
        }

        val session = createSession(profile.subject, materialId, request.blockId, meta.videoId)
        return MaterialVideoPlaybackResponse(
            materialId = materialId,
            blockId = request.blockId,
            videoId = meta.videoId,
            mode = "RF_RELAY",
            reason = null,
            embedUrl = embedUrl,
            relayUrl = "/api/materials/video-playback-sessions/${session.id}/stream",
            sessionId = session.id,
            expiresAt = session.expiresAt,
        )
    }

    fun findSession(sessionId: UUID): YoutubePlaybackSession? =
        sessions[sessionId]?.takeIf { session -> session.expiresAt.isAfter(clock.instant()) }

    private fun createSession(
        subject: String,
        materialId: UUID,
        blockId: String,
        videoId: String,
    ): YoutubePlaybackSession {
        val session = YoutubePlaybackSession(
            id = UUID.randomUUID(),
            subject = subject,
            materialId = materialId,
            blockId = blockId,
            videoId = videoId,
            expiresAt = clock.instant().plusSeconds(sessionTtlSeconds.coerceAtLeast(60)),
        )
        sessions[session.id] = session
        return session
    }

    private fun canAccessMaterial(
        authentication: JwtAuthenticationToken,
        material: LessonMaterialRow,
        currentUserId: UUID,
        subject: String,
    ): Boolean =
        materialCatalogService.canRead(material, authentication, currentUserId) ||
            assignmentRecipientRepo.countActiveMaterialRecipients(
                materialId = material.id,
                studentUserId = currentUserId,
                type = MetaData.AssignmentTypes.HOMEWORK,
                archivedStatus = MetaData.AssignmentStatuses.ARCHIVED,
            ) > 0 ||
            lessonRepo.countActiveMaterialParticipant(
                materialId = material.id,
                subject = subject,
                now = clock.instant(),
                excludedStatuses = listOf(MetaData.LessonStatuses.CANCELLED, MetaData.LessonStatuses.COMPLETED),
            ) > 0

    private fun resolveIpCountry(request: HttpServletRequest): String? {
        val headerName = geoCountryHeader.trim().takeIf { it.isNotEmpty() } ?: return null
        return request.getHeader(headerName)?.trim()?.uppercase()?.takeIf { country -> countryCodePattern.matches(country) }
    }

    private fun findBlock(document: JsonNode, blockId: String): JsonNode? {
        val pages = document.path("pages")
        if (!pages.isArray) {
            return null
        }
        return pages.asSequence()
            .flatMap { page -> page.path("blocks").asSequence() }
            .firstOrNull { block -> block.path("id").asText() == blockId }
    }

    private fun response(
        materialId: UUID,
        blockId: String,
        videoId: String?,
        mode: String,
        reason: String?,
        embedUrl: String?,
    ): MaterialVideoPlaybackResponse =
        MaterialVideoPlaybackResponse(
            materialId = materialId,
            blockId = blockId,
            videoId = videoId,
            mode = mode,
            reason = reason,
            embedUrl = embedUrl,
            relayUrl = null,
            sessionId = null,
            expiresAt = null,
        )

    companion object {
        private val countryCodePattern = Regex("^[A-Z]{2}$")
    }
}

data class YoutubePlaybackSession(
    val id: UUID,
    val subject: String,
    val materialId: UUID,
    val blockId: String,
    val videoId: String,
    val expiresAt: Instant,
)
