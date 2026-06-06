package com.playsay.gateway.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.converter.Converter
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter
import org.springframework.security.web.SecurityFilterChain

@Configuration
class SecurityConfig {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain =
        http
            .csrf { csrf -> csrf.disable() }
            .authorizeHttpRequests { requests ->
                requests
                    .requestMatchers(
                        "/hello",
                        "/actuator/health",
                        "/actuator/health/**",
                        "/v3/api-docs",
                        "/v3/api-docs.yaml",
                        "/v3/api-docs/**",
                        "/livekit/webhook",
                        "/api/registration/**",
                        "/registration/**",
                        "/public/payment-invoices/**",
                        "/payment-webhooks/yookassa",
                        "/schedule/lessons/*/collaboration-documents/*/snapshot",
                        "/ws/lessons",
                    ).permitAll()
                    .anyRequest().authenticated()
            }
            .oauth2ResourceServer { resourceServer ->
                resourceServer.jwt { jwt ->
                    jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())
                }
            }
            .build()

    @Bean
    fun jwtAuthenticationConverter(): JwtAuthenticationConverter {
        val scopeConverter = JwtGrantedAuthoritiesConverter()
        val converter = JwtAuthenticationConverter()
        converter.setJwtGrantedAuthoritiesConverter(
            Converter<Jwt, Collection<GrantedAuthority>> { jwt ->
                val authorities = scopeConverter.convert(jwt).orEmpty().toMutableList()
                val realmRoles = jwt.getClaimAsMap("realm_access")
                    ?.get("roles")
                    .asStringCollection()

                realmRoles
                    .filter { role -> role in applicationRoles }
                    .map { role -> SimpleGrantedAuthority("ROLE_$role") }
                    .forEach { authority -> authorities.add(authority) }

                authorities
            },
        )
        return converter
    }

    private fun Any?.asStringCollection(): Collection<String> =
        when (this) {
            is Collection<*> -> this.filterIsInstance<String>()
            else -> emptyList()
        }

    private companion object {
        val applicationRoles = setOf("STUDENT", "TEACHER", "ADMIN")
    }
}
