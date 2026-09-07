package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import java.net.URI

data class YoutubeVideoMeta(
    val videoId: String,
    val durationSeconds: Int?,
    val language: String?,
    val thumbnailUrl: String? = null,
)

data class YoutubeVideoPolicyDecision(
    val approved: Boolean,
    val reason: String?,
)

data class YoutubeVideoBlockDiagnostics(
    val blockType: String,
    val provider: String,
    val urlHost: String?,
    val urlKind: String,
    val videoId: String?,
    val videoMetaPresent: Boolean,
    val durationPresent: Boolean,
    val durationSeconds: Int?,
    val durationNodeType: String,
    val languagePresent: Boolean,
    val language: String?,
)

object YoutubeVideoSupport {
    private val youtubeIdPattern = Regex("^[A-Za-z0-9_-]{6,32}$")

    fun parseVideoId(value: String?): String? {
        val url = parseUri(value) ?: return null
        val host = url.host?.lowercase()?.removePrefix("www.") ?: return null
        val pathParts = url.path.orEmpty().split("/").filter { part -> part.isNotBlank() }
        val candidate = when (host) {
            "youtu.be" -> pathParts.firstOrNull()
            "youtube.com", "youtube-nocookie.com", "m.youtube.com", "music.youtube.com" -> when (pathParts.firstOrNull()) {
                "watch" -> queryParams(url.rawQuery)["v"]
                "embed", "shorts", "live", "v" -> pathParts.getOrNull(1)
                else -> null
            }
            else -> null
        }
        return candidate?.trim()?.takeIf { id -> youtubeIdPattern.matches(id) }
    }

    fun embedUrl(videoId: String, startSeconds: Int = 0): String =
        buildString {
            append("https://www.youtube-nocookie.com/embed/")
            append(videoId)
            append("?rel=0")
            if (startSeconds > 0) {
                append("&start=")
                append(startSeconds)
            }
        }

    fun videoMeetsPolicy(meta: YoutubeVideoMeta): YoutubeVideoPolicyDecision {
        val duration = meta.durationSeconds
        if (duration == null || duration <= 0 || meta.language.isNullOrBlank()) {
            return YoutubeVideoPolicyDecision(false, "YOUTUBE_METADATA_MISSING")
        }
        if (duration > 420) {
            return YoutubeVideoPolicyDecision(false, "YOUTUBE_DURATION_TOO_LONG")
        }
        if (!isEnglish(meta.language)) {
            return YoutubeVideoPolicyDecision(false, "YOUTUBE_LANGUAGE_NOT_ENGLISH")
        }
        return YoutubeVideoPolicyDecision(true, null)
    }

    fun metaFromBlock(block: JsonNode): YoutubeVideoMeta? {
        val videoId = parseVideoId(block.path("url").asText(null)) ?: return null
        val videoMeta = block.path("videoMeta")
        if (videoMeta.has("sourceUrl") && videoMeta.path("sourceUrl").asText() != block.path("url").asText()) {
            return YoutubeVideoMeta(videoId, null, null)
        }
        val duration = validDuration(videoMeta.path("durationSeconds"))
        val language = videoMeta.path("language").takeIf { it.isTextual }?.asText()?.trim()?.takeIf { it.isNotEmpty() }
        return YoutubeVideoMeta(
            videoId = videoId,
            durationSeconds = duration,
            language = language,
        )
    }

    fun validDuration(node: JsonNode): Int? =
        node.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.asInt()?.takeIf { it > 0 }

    /** Trusted automatic fields fill or constrain manual input; never override a known rejection. */
    fun effectiveMeta(stored: YoutubeVideoMeta?, automatic: YoutubeVideoMeta?): YoutubeVideoMeta? {
        if (stored == null) return automatic
        if (automatic == null || automatic.videoId != stored.videoId) return stored
        return stored.copy(
            durationSeconds = listOfNotNull(stored.durationSeconds, automatic.durationSeconds).maxOrNull(),
            language = if (!automatic.language.isNullOrBlank() && !isEnglish(automatic.language)) automatic.language
                else stored.language ?: automatic.language,
            thumbnailUrl = automatic.thumbnailUrl ?: stored.thumbnailUrl,
        )
    }

    fun clearMetadataForChangedSources(previous: JsonNode, next: JsonNode) {
        val oldBlocks = previous.path("pages").flatMap { it.path("blocks").toList() }.associateBy { it.path("id").asText() }
        next.path("pages").forEach { page -> page.path("blocks").forEach { block ->
            val old = oldBlocks[block.path("id").asText()]
            if (old != null && (old.path("url") != block.path("url") || old.path("provider") != block.path("provider"))) {
                val explicitlyReconfirmed = block.path("provider").asText().equals("YOUTUBE", true) &&
                    block.path("videoMeta").path("sourceUrl").asText() == block.path("url").asText() &&
                    block.path("videoMeta").has("sourceUrl")
                if (!explicitlyReconfirmed) (block as? com.fasterxml.jackson.databind.node.ObjectNode)?.remove("videoMeta")
            }
        } }
    }

    fun diagnosticsFromBlock(block: JsonNode): YoutubeVideoBlockDiagnostics {
        val videoMeta = block.path("videoMeta")
        val durationNode = videoMeta.path("durationSeconds")
        val languageNode = videoMeta.path("language")
        val language = languageNode.takeIf { node -> node.isTextual }?.asText()?.trim()?.takeIf { value -> value.isNotBlank() }
        val url = parseUri(block.path("url").asText(null))
        val host = url?.host?.lowercase()?.removePrefix("www.")

        return YoutubeVideoBlockDiagnostics(
            blockType = block.path("type").asText(""),
            provider = block.path("provider").asText(""),
            urlHost = host,
            urlKind = urlKind(url, host),
            videoId = parseVideoId(block.path("url").asText(null)),
            videoMetaPresent = !videoMeta.isMissingNode && !videoMeta.isNull,
            durationPresent = durationNode.isInt || durationNode.isLong,
            durationSeconds = durationNode.takeIf { node -> node.isInt || node.isLong }?.asInt(),
            durationNodeType = durationNode.nodeType.name,
            languagePresent = language != null,
            language = language,
        )
    }

    private fun isEnglish(value: String?): Boolean =
        value?.trim()?.lowercase()?.let { language -> language == "en" || language.startsWith("en-") || language.startsWith("en_") } == true

    private fun parseUri(value: String?): URI? {
        val cleanValue = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val parsed = runCatching { URI(cleanValue) }.getOrNull()
        if (parsed?.host != null) {
            return parsed
        }
        return runCatching { URI("https://$cleanValue") }.getOrNull()
    }

    private fun urlKind(url: URI?, host: String?): String {
        if (url == null) {
            return "INVALID_URL"
        }
        val pathParts = url.path.orEmpty().split("/").filter { part -> part.isNotBlank() }
        return when (host) {
            "youtu.be" -> "SHORT"
            "youtube.com", "youtube-nocookie.com", "m.youtube.com", "music.youtube.com" -> when (pathParts.firstOrNull()) {
                "watch" -> "WATCH"
                "embed" -> "EMBED"
                "shorts" -> "SHORTS"
                "live" -> "LIVE"
                "v" -> "V"
                else -> "UNSUPPORTED_PATH"
            }
            null -> "INVALID_URL"
            else -> "UNSUPPORTED_HOST"
        }
    }

    private fun queryParams(rawQuery: String?): Map<String, String> =
        rawQuery
            ?.split("&")
            ?.mapNotNull { part ->
                val index = part.indexOf("=")
                if (index < 0) {
                    null
                } else {
                    part.substring(0, index) to part.substring(index + 1)
                }
            }
            ?.toMap()
            ?: emptyMap()
}
