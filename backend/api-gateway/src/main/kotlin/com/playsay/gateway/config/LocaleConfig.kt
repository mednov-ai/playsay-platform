package com.playsay.gateway.config

import java.util.Locale
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.LocaleResolver
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver

@Configuration
class LocaleConfig {
    @Bean
    fun localeResolver(): LocaleResolver =
        AcceptHeaderLocaleResolver().apply {
            setDefaultLocale(Locale.forLanguageTag(defaultLanguage))
            supportedLocales = supportedLanguageTags.map(Locale::forLanguageTag)
        }

    private companion object {
        const val defaultLanguage = "ru"
        val supportedLanguageTags = listOf("ru", "en", "de", "fr")
    }
}
