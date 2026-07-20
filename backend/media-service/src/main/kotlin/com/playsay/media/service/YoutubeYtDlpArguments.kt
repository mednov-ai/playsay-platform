package com.playsay.media.service

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class YoutubeYtDlpArguments(
    @param:Value("\${playsay.media-service.youtube-pot-enabled:false}")
    private val enabled: Boolean = false,
    @param:Value("\${playsay.media-service.youtube-pot-provider-base-url:http://127.0.0.1:4416}")
    private val providerBaseUrl: String = "http://127.0.0.1:4416",
    @Value("\${playsay.media-service.youtube-pot-allowed-video-ids:}")
    allowedVideoIds: String = "",
    @param:Value("\${playsay.media-service.youtube-pot-player-clients:mweb}")
    private val playerClients: String = "mweb",
    @param:Value("\${playsay.media-service.ytdlp-plugin-directory:/usr/local/lib}")
    private val pluginDirectory: String = "/usr/local/lib",
    @param:Value("\${playsay.media-service.ytdlp-js-runtime:deno:/usr/local/bin/deno}")
    private val jsRuntime: String = "deno:/usr/local/bin/deno",
    @param:Value("\${playsay.media-service.youtube-pot-sleep-requests-seconds:1}")
    private val sleepRequestsSeconds: Long = 1,
) {
    private val allowlist = allowedVideoIds
        .split(',')
        .map(String::trim)
        .filter(String::isNotEmpty)
        .toSet()

    fun forVideo(videoId: String): List<String> {
        if (!enabled || ("*" !in allowlist && videoId !in allowlist)) {
            return emptyList()
        }
        return listOf(
            "--plugin-dirs",
            pluginDirectory,
            "--js-runtimes",
            jsRuntime,
            "--sleep-requests",
            sleepRequestsSeconds.coerceIn(0, 10).toString(),
            "--extractor-args",
            "youtubepot-bgutilhttp:base_url=${providerBaseUrl.trimEnd('/')}",
            "--extractor-args",
            "youtube:player_client=${normalizedPlayerClients()}",
        )
    }

    fun isEnabledFor(videoId: String): Boolean = forVideo(videoId).isNotEmpty()

    private fun normalizedPlayerClients(): String =
        playerClients
            .split(',')
            .map(String::trim)
            .filter(String::isNotEmpty)
            .joinToString(",")
            .ifEmpty { "mweb" }
}
