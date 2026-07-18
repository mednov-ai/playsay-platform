package com.playsay.gateway.config

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class MaterialHtmlGameEnrichmentConfig {
    @Bean(destroyMethod = "shutdown")
    fun materialHtmlGameEnrichmentExecutor(): ExecutorService =
        Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "material-html-game-enrichment").apply { isDaemon = true }
        }
}
