package com.playsay.vocabulary.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.core.convert.converter.Converter
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.client.RestClient

@Configuration
class SecurityConfig {
    @Bean
    fun restClientBuilder(): RestClient.Builder = RestClient.builder()

    @Bean
    fun jwtAuthenticationConverter(): JwtAuthenticationConverter {
        val scopeConverter = JwtGrantedAuthoritiesConverter()
        return JwtAuthenticationConverter().apply {
            setJwtGrantedAuthoritiesConverter(
                Converter<Jwt, Collection<GrantedAuthority>> { jwt ->
                    val authorities = scopeConverter.convert(jwt).orEmpty().toMutableList()
                    jwt.getClaimAsMap("realm_access")
                        ?.get("roles")
                        .asStringCollection()
                        .filter { it in applicationRoles }
                        .map { SimpleGrantedAuthority("ROLE_$it") }
                        .forEach(authorities::add)
                    authorities
                },
            )
        }
    }

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain =
        http.csrf { it.disable() }
            .authorizeHttpRequests { requests ->
                requests.requestMatchers(
                    "/actuator/health",
                    "/actuator/health/**",
                    "/internal/user-data/**",
                    "/internal/vocabulary/**",
                    "/api/vocabulary/ws",
                ).permitAll()
                    .anyRequest().authenticated()
            }
            .oauth2ResourceServer { resourceServer ->
                resourceServer.jwt { jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()) }
            }
            .build()

    private fun Any?.asStringCollection(): Collection<String> = when (this) {
        is Collection<*> -> filterIsInstance<String>()
        else -> emptyList()
    }

    private companion object {
        val applicationRoles = setOf("STUDENT", "TEACHER", "ADMIN")
    }
}
