package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import java.net.URI

data class YoutubeVideoMeta(
    val videoId: String,
    val durationSeconds: Int?,
    val language: String?,
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
        if (duration == null) {
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
        val duration = videoMeta.path("durationSeconds").takeIf { node -> node.isInt || node.isLong }?.asInt()
        val language = videoMeta.path("language").asText(null)
        return YoutubeVideoMeta(
            videoId = videoId,
            durationSeconds = duration,
            language = language,
        )
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
