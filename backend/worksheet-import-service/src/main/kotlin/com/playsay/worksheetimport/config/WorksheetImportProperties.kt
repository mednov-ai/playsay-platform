package com.playsay.worksheetimport.config

import jakarta.annotation.PostConstruct
import java.time.Duration
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@ConfigurationProperties("playsay.worksheet-import")
data class WorksheetImportProperties(
    val enabled: Boolean = false,
    val serviceToken: String = "",
    val packet: Packet = Packet(),
    val pdf: Pdf = Pdf(),
    val analysis: Analysis = Analysis(),
    val retention: Retention = Retention(),
    val storage: Storage = Storage(),
) {
    data class Packet(
        val maxPages: Int = 100,
        val maxBytes: Long = 128L * 1024 * 1024,
        val maxImageBytes: Long = 12L * 1024 * 1024,
    )

    data class Pdf(
        val maxBytes: Long = 64L * 1024 * 1024,
        val maxPages: Int = 50,
        val maxPagePixels: Long = 40_000_000,
        val maxTotalPixels: Long = 250_000_000,
        val renderDpi: Int = 144,
        val timeout: Duration = Duration.ofSeconds(45),
        val maxMemoryBytes: Long = 256L * 1024 * 1024,
    )

    data class Analysis(
        val provider: String = "stub",
        val apiKey: String = "",
        val model: String = "gpt-5.4-mini",
        val baseUrl: String = "https://api.openai.com/v1",
        val reasoningEffort: String = "medium",
        val maxVisionBytes: Int = 20 * 1024 * 1024,
        val maxResponseBytes: Int = 4 * 1024 * 1024,
        val requestTimeout: Duration = Duration.ofSeconds(75),
        val concurrency: Int = 2,
        val maxRetries: Int = 3,
        val lease: Duration = Duration.ofMinutes(5),
        val pollDelay: Duration = Duration.ofSeconds(2),
        val confidenceThreshold: Double = 0.75,
    )

    data class Retention(
        val duration: Duration = Duration.ofHours(72),
        val cleanupDelay: Duration = Duration.ofHours(1),
    )

    data class Storage(
        val provider: String = "memory",
        val endpoint: String = "",
        val region: String = "us-east-1",
        val bucket: String = "playsay-worksheet-staging",
        val accessKey: String = "",
        val secretKey: String = "",
        val pathStyleAccess: Boolean = true,
        val createBucket: Boolean = false,
    )

    @PostConstruct
    fun validate() {
        require(packet.maxPages in 8..200) { "worksheet packet max-pages must be between 8 and 200" }
        require(packet.maxImageBytes in 1..packet.maxBytes) { "worksheet image bound must fit packet bound" }
        require(pdf.maxBytes in 1..packet.maxBytes) { "worksheet PDF bound must fit packet bound" }
        require(pdf.maxPages in 1..packet.maxPages) { "worksheet PDF page bound must fit packet page bound" }
        require(pdf.maxPagePixels in 1..pdf.maxTotalPixels) { "worksheet PDF pixel bounds are invalid" }
        require(pdf.renderDpi in 72..300) { "worksheet PDF render DPI must be between 72 and 300" }
        require(!pdf.timeout.isZero && !pdf.timeout.isNegative) { "worksheet PDF timeout must be positive" }
        require(pdf.maxMemoryBytes >= 32L * 1024 * 1024) { "worksheet PDF memory bound is too small" }
        require(analysis.concurrency in 1..16) { "worksheet analysis concurrency must be between 1 and 16" }
        require(analysis.provider in setOf("stub", "openai")) { "worksheet analysis provider must be stub or openai" }
        require(analysis.maxVisionBytes in 1..packet.maxBytes) { "worksheet vision request bound must fit packet bound" }
        require(analysis.maxResponseBytes in 1..16 * 1024 * 1024) { "worksheet analysis response bound is invalid" }
        require(!analysis.requestTimeout.isZero && !analysis.requestTimeout.isNegative) { "worksheet analysis timeout must be positive" }
        if (enabled && analysis.provider == "openai") require(analysis.apiKey.isNotBlank()) { "worksheet OpenAI API key is required" }
        require(analysis.maxRetries in 0..10) { "worksheet analysis retries must be between 0 and 10" }
        require(!analysis.lease.isZero && !analysis.lease.isNegative) { "worksheet analysis lease must be positive" }
        require(!analysis.pollDelay.isZero && !analysis.pollDelay.isNegative) { "worksheet poll delay must be positive" }
        require(analysis.confidenceThreshold in 0.0..1.0) { "worksheet confidence threshold must be between 0 and 1" }
        require(!retention.duration.isZero && !retention.duration.isNegative) { "worksheet retention must be positive" }
        require(!retention.cleanupDelay.isZero && !retention.cleanupDelay.isNegative) { "worksheet cleanup delay must be positive" }
        require(storage.provider in setOf("memory", "s3")) { "worksheet storage provider must be memory or s3" }
        if (enabled) require(serviceToken.isNotBlank()) { "worksheet service token is required when import is enabled" }
        if (storage.provider == "s3") {
            require(storage.bucket.isNotBlank()) { "worksheet staging bucket is required" }
            require(storage.accessKey.isNotBlank() && storage.secretKey.isNotBlank()) { "worksheet staging credentials are required" }
        }
    }
}

@Configuration
@EnableConfigurationProperties(WorksheetImportProperties::class)
class WorksheetImportPropertiesConfiguration
