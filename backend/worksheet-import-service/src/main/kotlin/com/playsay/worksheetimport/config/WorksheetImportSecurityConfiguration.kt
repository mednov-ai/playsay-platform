package com.playsay.worksheetimport.config

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.converter.Converter
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter
import org.springframework.security.web.SecurityFilterChain
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

const val WORKSHEET_SERVICE_TOKEN_HEADER = "X-PlaySay-Worksheet-Service-Token"

@Configuration
class WorksheetImportSecurityConfiguration {
    @Bean
    fun worksheetSecurityFilterChain(
        http: HttpSecurity,
        serviceTokenFilter: WorksheetServiceTokenFilter,
    ): SecurityFilterChain = http
        .csrf { it.disable() }
        .authorizeHttpRequests { requests ->
            requests
                .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/prometheus").permitAll()
                .requestMatchers("/internal/worksheet-imports/**").hasAnyRole("TEACHER", "ADMIN")
                .anyRequest().denyAll()
        }
        .oauth2ResourceServer { resourceServer ->
            resourceServer.jwt { jwt -> jwt.jwtAuthenticationConverter(worksheetJwtAuthenticationConverter()) }
        }
        .addFilterBefore(serviceTokenFilter, BearerTokenAuthenticationFilter::class.java)
        .build()

    @Bean
    fun worksheetJwtAuthenticationConverter(): JwtAuthenticationConverter {
        val scopes = JwtGrantedAuthoritiesConverter()
        return JwtAuthenticationConverter().also { converter ->
            converter.setJwtGrantedAuthoritiesConverter(
                Converter<Jwt, Collection<GrantedAuthority>> { jwt ->
                    val authorities = scopes.convert(jwt).orEmpty().toMutableList()
                    val roles = jwt.getClaimAsMap("realm_access")?.get("roles") as? Collection<*>
                    roles.orEmpty().filterIsInstance<String>()
                        .filter { it in setOf("STUDENT", "TEACHER", "ADMIN") }
                        .mapTo(authorities) { SimpleGrantedAuthority("ROLE_$it") }
                    authorities
                },
            )
        }
    }
}

@Component
class WorksheetServiceTokenFilter(
    private val properties: WorksheetImportProperties,
) : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        !request.requestURI.startsWith("/internal/worksheet-imports")

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        val supplied = request.getHeader(WORKSHEET_SERVICE_TOKEN_HEADER).orEmpty()
        val expected = properties.serviceToken
        if (expected.isBlank() || supplied.isBlank() || !secureEquals(expected, supplied)) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED)
            return
        }
        filterChain.doFilter(request, response)
    }

    private fun secureEquals(expected: String, actual: String): Boolean = MessageDigest.isEqual(
        expected.toByteArray(StandardCharsets.UTF_8),
        actual.toByteArray(StandardCharsets.UTF_8),
    )
}
