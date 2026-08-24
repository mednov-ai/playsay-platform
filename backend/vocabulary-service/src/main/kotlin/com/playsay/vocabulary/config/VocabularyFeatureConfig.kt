package com.playsay.vocabulary.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@ConfigurationProperties(prefix = "playsay.vocabulary.features")
data class VocabularyFeatureProperties(
    val composerEnabled: Boolean = false,
    val adaptivePolicyEnabled: Boolean = false,
    val deliveryPoliciesEnabled: Boolean = false,
    val keyNgramsEnabled: Boolean = false,
    val generatedMediaEnabled: Boolean = false,
    val lexicalBackfillEnabled: Boolean = false,
)

@ConfigurationProperties(prefix = "playsay.vocabulary.catalog")
data class VocabularyCatalogProperties(
    val schoolScopeKey: String = "honey-school",
)

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(VocabularyFeatureProperties::class, VocabularyCatalogProperties::class)
class VocabularyFeatureConfig
