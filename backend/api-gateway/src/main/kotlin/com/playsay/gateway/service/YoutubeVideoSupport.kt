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

    private fun isEnglish(value: String?): Boolean =
        value?.trim()?.lowercase()?.let { language -> language == "en" || language.startsWith("en-") || language.startsWith("en_") } == true

    private fun parseUri(value: String?): URI? {
        val cleanValue = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return runCatching { URI(cleanValue) }
            .recoverCatching { URI("https://$cleanValue") }
            .getOrNull()
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
