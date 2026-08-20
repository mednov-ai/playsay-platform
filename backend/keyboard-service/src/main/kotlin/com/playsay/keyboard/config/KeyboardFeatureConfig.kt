package com.playsay.keyboard.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@ConfigurationProperties(prefix = "playsay.keyboard.features")
data class KeyboardFeatureProperties(
    val vocabularyTypedTargetsEnabled: Boolean = false,
)

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(KeyboardFeatureProperties::class)
class KeyboardFeatureConfig
