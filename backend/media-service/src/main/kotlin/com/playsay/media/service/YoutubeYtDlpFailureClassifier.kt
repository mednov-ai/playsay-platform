package com.playsay.media.service

object YoutubeYtDlpFailureClassifier {
    fun classify(stderr: String): String {
        val normalized = stderr.lowercase()
        return when {
            "playback on other websites has been disabled" in normalized -> "EMBED_DISABLED"
            "sign in to confirm" in normalized || "not a bot" in normalized -> "BOT_CHECK"
            "po token" in normalized -> "PO_TOKEN_REQUIRED"
            "http error 429" in normalized || "too many requests" in normalized -> "RATE_LIMITED"
            "requested format is not available" in normalized -> "FORMAT_UNAVAILABLE"
            "private video" in normalized -> "PRIVATE_VIDEO"
            "video is not available" in normalized || "video unavailable" in normalized -> "VIDEO_UNAVAILABLE"
            else -> "UNKNOWN"
        }
    }
}
