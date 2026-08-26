package com.playsay.gateway.config

import jakarta.annotation.PostConstruct
import java.time.Duration
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@ConfigurationProperties("playsay.chat-push")
data class ChatPushProperties(
    val enabled: Boolean = false,
    val publicKey: String = "",
    val privateKey: String = "",
    val subject: String = "",
    val pollDelayMs: Long = 3_000,
    val initialDelayMs: Long = 3_000,
    val lease: Duration = Duration.ofMinutes(1),
    val retryDelays: String = "PT10S,PT1M,PT5M",
) {
    val parsedRetryDelays: List<Duration>
        get() = retryDelays.split(',').map(String::trim).filter(String::isNotEmpty).map(Duration::parse)

    @PostConstruct
    fun validate() {
        require(pollDelayMs > 0 && initialDelayMs >= 0) { "chat push polling delays are invalid" }
        require(!lease.isZero && !lease.isNegative) { "chat push lease must be positive" }
        require(parsedRetryDelays.isNotEmpty() && parsedRetryDelays.all { !it.isZero && !it.isNegative }) {
            "chat push retry delays must be positive"
        }
        if (enabled) {
            require(publicKey.isNotBlank()) { "chat push public key is required when enabled" }
            require(privateKey.isNotBlank()) { "chat push private key is required when enabled" }
            require(subject.startsWith("mailto:") || subject.startsWith("https://")) {
                "chat push subject must use mailto or HTTPS"
            }
        }
    }
}

@Configuration
@EnableConfigurationProperties(ChatPushProperties::class)
class ChatPushPropertiesConfiguration
