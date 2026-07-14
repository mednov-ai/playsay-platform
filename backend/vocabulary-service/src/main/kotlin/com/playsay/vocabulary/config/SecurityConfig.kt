package com.playsay.vocabulary.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.client.RestClient

@Configuration
class SecurityConfig {
    @Bean
    fun restClientBuilder(): RestClient.Builder = RestClient.builder()

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain =
        http.csrf { it.disable() }
            .authorizeHttpRequests { requests ->
                requests.requestMatchers("/actuator/health", "/actuator/health/**", "/internal/user-data/**").permitAll()
                    .anyRequest().authenticated()
            }
            .oauth2ResourceServer { it.jwt {} }
            .build()
}
