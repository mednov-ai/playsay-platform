package com.playsay.gateway

import kotlin.test.Test
import kotlin.test.assertTrue
import org.springframework.security.oauth2.jwt.Jwt

class SecurityConfigTest {
    @Test
    fun `maps Keycloak realm roles to Spring authorities`() {
        val jwt = Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject("user-1")
            .claim("realm_access", mapOf("roles" to listOf("STUDENT", "TEACHER")))
            .build()

        val authentication = SecurityConfig().jwtAuthenticationConverter().convert(jwt)
        val authorities = authentication.authorities.map { authority -> authority.authority }

        assertTrue("ROLE_STUDENT" in authorities)
        assertTrue("ROLE_TEACHER" in authorities)
    }
}
