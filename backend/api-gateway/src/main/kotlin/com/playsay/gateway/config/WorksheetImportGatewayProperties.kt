package com.playsay.gateway.config

import jakarta.annotation.PostConstruct
import java.time.Duration
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@ConfigurationProperties("playsay.worksheet-import")
data class WorksheetImportGatewayProperties(
    val enabled: Boolean = false,
    val baseUrl: String = "http://worksheet-import-service.playsay-dev.svc.cluster.local",
    val serviceToken: String = "",
    val connectTimeout: Duration = Duration.ofSeconds(5),
    val requestTimeout: Duration = Duration.ofMinutes(2),
    val maxFileBytes: Long = 64L * 1024 * 1024,
    val maxRequestBytes: Long = 128L * 1024 * 1024,
) {
    @PostConstruct
    fun validate() {
        require(baseUrl.startsWith("http://") || baseUrl.startsWith("https://")) { "worksheet import base URL must use HTTP(S)" }
        require(!connectTimeout.isZero && !connectTimeout.isNegative) { "worksheet connect timeout must be positive" }
        require(!requestTimeout.isZero && !requestTimeout.isNegative) { "worksheet request timeout must be positive" }
        require(maxFileBytes > 0 && maxFileBytes <= maxRequestBytes) { "worksheet gateway upload bounds are invalid" }
        if (enabled) require(serviceToken.isNotBlank()) { "worksheet service token is required when facade is enabled" }
    }
}

@Configuration
@EnableConfigurationProperties(WorksheetImportGatewayProperties::class)
class WorksheetImportGatewayPropertiesConfiguration
