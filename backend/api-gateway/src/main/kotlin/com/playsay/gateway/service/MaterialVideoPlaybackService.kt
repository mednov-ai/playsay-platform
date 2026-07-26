package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.playsay.gateway.dto.MaterialVideoPlaybackRequest
import com.playsay.gateway.dto.MaterialVideoPlaybackResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component

@Component
class MaterialVideoPlaybackService(
    private val materialCatalogService: LessonMaterialCatalogService,
    private val materialReadAccessPolicy: MaterialReadAccessPolicy,
    private val userProfileStore: UserProfileStore,
    private val youtubeMediaClient: YoutubeMediaClient,
    private val materialAssetService: MaterialAssetService,
    private val youtubeVideoCacheService: YoutubeVideoCacheService,
    @param:Value("\${playsay.video.youtube.rf-relay.enabled:false}")
    private val rfRelayEnabled: Boolean,
    @param:Value("\${playsay.video.youtube.rf-relay.geo-country-header:}")
    private val geoCountryHeader: String,
    @param:Value("\${playsay.video.youtube.rf-relay.require-geo-country:true}")
    private val requireGeoCountry: Boolean,
    @param:Value("\${playsay.video.youtube.cache.enabled:false}")
    private val youtubeCacheEnabled: Boolean,
) {
    fun playback(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: MaterialVideoPlaybackRequest,
        servletRequest: HttpServletRequest,
    ): MaterialVideoPlaybackResponse {
        val requestedQuality = YoutubePlaybackQuality.normalized(request.quality)
        val profile = userProfileStore.current(authentication)
        val materialRow = materialCatalogService.find(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        if (materialRow.status == MetaData.MaterialStatuses.ARCHIVED || !materialReadAccessPolicy.canRead(authentication, materialRow)) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        val material = materialCatalogService.toResponse(materialRow)
        val document = material.document
        val block = findBlock(document, request.blockId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val ipCountry = resolveIpCountry(servletRequest)
        val profileCountry = profile.countryCode?.uppercase()
        val diagnostics = YoutubeVideoSupport.diagnosticsFromBlock(block)
        val provider = block.path("provider").asText("").uppercase()
        if (block.path("type").asText("") != "videoEmbed" || provider != "YOUTUBE") {
            return response(materialId, request.blockId, null, "BLOCKED", "YOUTUBE_BLOCK_REQUIRED", null, diagnostics, profileCountry, ipCountry, requestedQuality)
        }

        val storedMeta = YoutubeVideoSupport.metaFromBlock(block)
        val storedMetaComplete = storedMeta?.durationSeconds != null && storedMeta.language != null
        val cachedMeta = diagnostics.videoId
            ?.let { videoId -> youtubeVideoCacheService.find(videoId) }
            ?.takeIf { cache -> cache.durationSeconds != null && cache.language != null }
            ?.let { cache ->
                YoutubeVideoMeta(
                    videoId = cache.videoId,
                    durationSeconds = cache.durationSeconds,
                    language = cache.language,
                    thumbnailUrl = cache.thumbnailUrl,
                )
            }
        val resolvedMeta = if (storedMetaComplete || cachedMeta != null) null else diagnostics.videoId?.let { videoId -> youtubeMediaClient.resolveMetadata(videoId) }
        val meta = storedMeta?.takeIf { storedMetaComplete } ?: cachedMeta ?: resolvedMeta
            ?: return response(
                materialId,
                request.blockId,
                diagnostics.videoId,
                "NEEDS_REVIEW",
                "YOUTUBE_METADATA_MISSING",
                null,
                diagnostics,
                profileCountry,
                ipCountry,
                requestedQuality,
                metadataSource = "MISSING",
                effectiveMeta = null,
            )
        val metadataSource = when {
            storedMetaComplete -> "STORED"
            cachedMeta != null -> "CACHE_RECORD"
            else -> "MEDIA_SERVICE_ON_DEMAND"
        }
        val embedUrl = YoutubeVideoSupport.embedUrl(meta.videoId)
        val policy = YoutubeVideoSupport.videoMeetsPolicy(meta)
        if (!policy.approved) {
            return response(materialId, request.blockId, meta.videoId, "NEEDS_REVIEW", policy.reason, embedUrl, diagnostics, profileCountry, ipCountry, requestedQuality, metadataSource, meta)
        }

        if (!rfRelayEnabled) {
            return response(materialId, request.blockId, meta.videoId, "EMBED", "RF_RELAY_DISABLED", embedUrl, diagnostics, profileCountry, ipCountry, requestedQuality, metadataSource, meta)
        }
        if (profileCountry != "RU") {
            return response(materialId, request.blockId, meta.videoId, "EMBED", "PROFILE_COUNTRY_NOT_RU", embedUrl, diagnostics, profileCountry, ipCountry, requestedQuality, metadataSource, meta)
        }
        if (requireGeoCountry && ipCountry != "RU") {
            val reason = if (ipCountry == null) "IP_COUNTRY_UNKNOWN" else "PROFILE_IP_COUNTRY_MISMATCH"
            return response(materialId, request.blockId, meta.videoId, "EMBED", reason, embedUrl, diagnostics, profileCountry, ipCountry, requestedQuality, metadataSource, meta)
        }

        val existingThumbnail = materialAssetService.findYoutubeThumbnailAsset(materialId, request.blockId, meta.videoId)
        val thumbnailAssetId = existingThumbnail?.id ?: UUID.randomUUID()
        val thumbnailStorageKey = existingThumbnail?.storageKey ?: "material-assets/$materialId/$thumbnailAssetId.youtube-thumbnail"
        val mediaSession = youtubeMediaClient.createPlaybackSession(
            YoutubeMediaPlaybackSessionCommand(
                subject = profile.subject,
                materialId = materialId,
                blockId = request.blockId,
                videoId = meta.videoId,
                requestedQuality = requestedQuality.name,
                thumbnailStorageKey = if (existingThumbnail == null) thumbnailStorageKey else null,
                thumbnailSourceUrl = meta.thumbnailUrl,
            ),
        )
        if (
            youtubeCacheEnabled &&
            requestedQuality == YoutubePlaybackQuality.MEDIUM &&
            mediaSession.deliverySource != "MINIO_CACHE"
        ) {
            youtubeVideoCacheService.markUnavailable(meta.videoId)
        }
        val thumbnailAsset = existingThumbnail ?: maybeCreateYoutubeThumbnailAsset(
            materialId = materialId,
            blockId = request.blockId,
            videoId = meta.videoId,
            assetId = thumbnailAssetId,
            storageKey = thumbnailStorageKey,
            mediaSession = mediaSession,
        )
        logPlaybackDecision(materialId, request.blockId, meta.videoId, "RF_RELAY", null, diagnostics, profileCountry, ipCountry, mediaSession.sessionId, metadataSource, meta)
        return MaterialVideoPlaybackResponse(
            materialId = materialId,
            blockId = request.blockId,
            videoId = meta.videoId,
            mode = "RF_RELAY",
            reason = null,
            embedUrl = embedUrl,
            relayUrl = "/api/media/video-playback-sessions/${mediaSession.sessionId}/stream",
            sessionId = mediaSession.sessionId,
            expiresAt = mediaSession.expiresAt,
            requestedQuality = requestedQuality.name,
            selectedQuality = mediaSession.selectedQuality,
            selectedHeight = mediaSession.selectedHeight,
            thumbnailUrl = thumbnailAsset?.contentUrl,
            thumbnailAssetId = thumbnailAsset?.id,
            deliverySource = mediaSession.deliverySource,
            cacheStatus = cacheStatus(meta.videoId),
        )
    }

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
        diagnostics: YoutubeVideoBlockDiagnostics?,
        profileCountry: String?,
        ipCountry: String?,
        requestedQuality: YoutubePlaybackQuality,
        metadataSource: String? = null,
        effectiveMeta: YoutubeVideoMeta? = null,
    ): MaterialVideoPlaybackResponse {
        logPlaybackDecision(materialId, blockId, videoId, mode, reason, diagnostics, profileCountry, ipCountry, null, metadataSource, effectiveMeta)
        return MaterialVideoPlaybackResponse(
            materialId = materialId,
            blockId = blockId,
            videoId = videoId,
            mode = mode,
            reason = reason,
            embedUrl = embedUrl,
            relayUrl = null,
            sessionId = null,
            expiresAt = null,
            requestedQuality = requestedQuality.name,
            selectedQuality = null,
            selectedHeight = null,
            thumbnailUrl = null,
            thumbnailAssetId = null,
            deliverySource = null,
            cacheStatus = cacheStatus(videoId),
        )
    }

    private fun cacheStatus(videoId: String?): String? {
        if (videoId == null) {
            return null
        }
        if (!youtubeCacheEnabled) {
            return "DISABLED"
        }
        return youtubeVideoCacheService.find(videoId)?.status ?: "MISS"
    }

    private fun maybeCreateYoutubeThumbnailAsset(
        materialId: UUID,
        blockId: String,
        videoId: String,
        assetId: UUID,
        storageKey: String,
        mediaSession: YoutubeMediaPlaybackSessionResult,
    ): com.playsay.gateway.dto.MaterialAssetResponse? {
        if (!mediaSession.thumbnailStored) {
            logger.warn(
                "YouTube RF relay thumbnail was not stored materialId={} blockId={} videoId={} sourceThumbnailPresent={}",
                materialId,
                blockId,
                videoId,
                mediaSession.thumbnailSourceUrl != null,
            )
            return null
        }
        val sourceUrl = mediaSession.thumbnailSourceUrl?.trim()?.takeIf { value -> value.isNotBlank() }
        if (sourceUrl == null) {
            logger.warn("YouTube RF relay thumbnail upload returned without source URL materialId={} blockId={} videoId={}", materialId, blockId, videoId)
            return null
        }
        return runCatching {
            materialAssetService.insertYoutubeThumbnailAsset(
                materialId = materialId,
                assetId = assetId,
                blockId = blockId,
                videoId = videoId,
                sourceThumbnailUrl = sourceUrl,
                storageKey = storageKey,
                contentType = mediaSession.thumbnailContentType,
                byteSize = mediaSession.thumbnailByteSize,
            )
        }.getOrElse {
            logger.warn("YouTube RF relay thumbnail asset row could not be created materialId={} blockId={} videoId={}", materialId, blockId, videoId, it)
            null
        }
    }

    private fun logPlaybackDecision(
        materialId: UUID,
        blockId: String,
        videoId: String?,
        mode: String,
        reason: String?,
        diagnostics: YoutubeVideoBlockDiagnostics?,
        profileCountry: String?,
        ipCountry: String?,
        sessionId: UUID?,
        metadataSource: String?,
        effectiveMeta: YoutubeVideoMeta?,
    ) {
        logger.info(
            "YouTube RF relay playback decision materialId={} blockId={} sessionId={} mode={} reason={} videoId={} relayEnabled={} requireGeoCountry={} geoHeaderConfigured={} profileCountry={} ipCountry={} metadataSource={} effectiveDurationSeconds={} effectiveLanguage={} blockType={} provider={} urlHost={} urlKind={} parsedVideoId={} videoMetaPresent={} durationPresent={} durationSeconds={} durationNodeType={} languagePresent={} language={}",
            materialId,
            blockId,
            sessionId,
            mode,
            reason,
            videoId,
            rfRelayEnabled,
            requireGeoCountry,
            geoCountryHeader.isNotBlank(),
            profileCountry,
            ipCountry,
            metadataSource,
            effectiveMeta?.durationSeconds,
            effectiveMeta?.language,
            diagnostics?.blockType,
            diagnostics?.provider,
            diagnostics?.urlHost,
            diagnostics?.urlKind,
            diagnostics?.videoId,
            diagnostics?.videoMetaPresent,
            diagnostics?.durationPresent,
            diagnostics?.durationSeconds,
            diagnostics?.durationNodeType,
            diagnostics?.languagePresent,
            diagnostics?.language,
        )
    }

    companion object {
        private val countryCodePattern = Regex("^[A-Z]{2}$")
        private val logger = LoggerFactory.getLogger(MaterialVideoPlaybackService::class.java)
    }
}

enum class YoutubePlaybackQuality(val targetHeight: Int) {
    LOW(480),
    MEDIUM(720),
    HIGH(1080);

    companion object {
        fun normalized(value: String?): YoutubePlaybackQuality =
            entries.firstOrNull { quality -> quality.name == value?.trim()?.uppercase() } ?: MEDIUM
    }
}
