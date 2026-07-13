package com.playsay.gateway.config

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class YoutubeVideoCacheConfig {
    @Bean(destroyMethod = "shutdown")
    fun youtubeVideoCacheExecutor(): ExecutorService =
        Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "youtube-video-cache-worker").apply { isDaemon = true }
        }
}
