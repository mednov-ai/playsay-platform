package com.playsay.media

import java.time.Clock
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

enum class YoutubePlaybackQuality(val targetHeight: Int) {
    LOW(480),
    MEDIUM(720),
    HIGH(1080);

    companion object {
        fun normalized(value: String?): YoutubePlaybackQuality =
            entries.firstOrNull { quality -> quality.name == value?.trim()?.uppercase() } ?: MEDIUM

        fun fromHeight(height: Int?): YoutubePlaybackQuality =
            when {
                height == null -> MEDIUM
                height <= LOW.targetHeight -> LOW
                height <= MEDIUM.targetHeight -> MEDIUM
                else -> HIGH
            }
    }
}

data class YoutubeFormat(
    val formatId: String,
    val url: String,
    val protocol: String?,
    val acodec: String?,
    val vcodec: String?,
    val height: Int?,
    val ext: String?,
)

data class SelectedYoutubeFormat(
    val formatId: String,
    val upstreamUrl: String,
    val height: Int?,
    val selectedQuality: YoutubePlaybackQuality,
)

object YoutubeQualitySelector {
    fun select(
        formats: List<YoutubeFormat>,
        requestedQuality: YoutubePlaybackQuality,
    ): SelectedYoutubeFormat? {
        val progressive = formats
            .filter { format -> format.url.startsWith("https://") || format.url.startsWith("http://") }
            .filter { format -> format.protocol.orEmpty().startsWith("http") }
            .filter { format -> format.acodec?.lowercase() != "none" && format.vcodec?.lowercase() != "none" }
            .filter { format -> (format.height ?: 0) > 0 }
            .sortedBy { format -> format.height ?: Int.MAX_VALUE }

        val selected = progressive
            .filter { format -> requireNotNull(format.height) <= requestedQuality.targetHeight }
            .maxByOrNull { format -> requireNotNull(format.height) }
            ?: progressive.minByOrNull { format -> requireNotNull(format.height) }
            ?: return null

        return SelectedYoutubeFormat(
            formatId = selected.formatId,
            upstreamUrl = selected.url,
            height = selected.height,
            selectedQuality = YoutubePlaybackQuality.fromHeight(selected.height),
        )
    }
}

data class YoutubePlaybackSession(
    val id: UUID,
    val subject: String,
    val materialId: UUID,
    val blockId: String,
    val videoId: String,
    val upstreamUrl: String,
    val requestedQuality: YoutubePlaybackQuality,
    val selectedQuality: YoutubePlaybackQuality,
    val selectedHeight: Int?,
    val expiresAt: Instant,
)

@Component
class YoutubePlaybackSessionStore(
    private val clock: Clock = Clock.systemUTC(),
) {
    private val sessions = ConcurrentHashMap<UUID, YoutubePlaybackSession>()

    fun create(
        subject: String,
        materialId: UUID,
        blockId: String,
        videoId: String,
        upstreamUrl: String,
        requestedQuality: YoutubePlaybackQuality,
        selectedQuality: YoutubePlaybackQuality,
        selectedHeight: Int?,
        ttlSeconds: Long,
    ): YoutubePlaybackSession {
        cleanupExpired()
        val session = YoutubePlaybackSession(
            id = UUID.randomUUID(),
            subject = subject,
            materialId = materialId,
            blockId = blockId,
            videoId = videoId,
            upstreamUrl = upstreamUrl,
            requestedQuality = requestedQuality,
            selectedQuality = selectedQuality,
            selectedHeight = selectedHeight,
            expiresAt = clock.instant().plusSeconds(ttlSeconds.coerceIn(60, 3600)),
        )
        sessions[session.id] = session
        return session
    }

    fun find(sessionId: UUID): YoutubePlaybackSession? =
        sessions[sessionId]
            ?.takeIf { session -> session.expiresAt.isAfter(clock.instant()) }
            ?: sessions.remove(sessionId)?.let { null }

    private fun cleanupExpired() {
        val now = clock.instant()
        sessions.entries.removeIf { (_, session) -> !session.expiresAt.isAfter(now) }
    }
}

class MediaServiceException(
    val status: HttpStatus,
    val code: String,
    message: String = code,
    cause: Throwable? = null,
) : RuntimeException(message, cause)
