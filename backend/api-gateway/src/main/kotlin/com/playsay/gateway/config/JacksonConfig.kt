@file:Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")

package com.playsay.gateway.config

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.converter.HttpMessageConverter
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class JacksonConfig : WebMvcConfigurer {
    @Bean
    fun objectMapper(): ObjectMapper =
        jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

    override fun extendMessageConverters(converters: MutableList<HttpMessageConverter<*>>) {
        converters.removeIf { converter -> converter is MappingJackson2HttpMessageConverter }
        converters.add(0, MappingJackson2HttpMessageConverter(objectMapper()))
    }
}
