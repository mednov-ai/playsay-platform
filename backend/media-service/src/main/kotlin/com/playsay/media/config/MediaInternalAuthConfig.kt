package com.playsay.media.config

import com.playsay.media.service.MediaInternalAuth
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class MediaInternalAuthConfig {
    @Bean
    fun mediaInternalAuth(
        @Value("\${playsay.media-service.service-token:}") serviceToken: String,
    ): MediaInternalAuth = MediaInternalAuth(serviceToken)
}
