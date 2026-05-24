package com.playsay.gateway

import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class MeControllerTest {
    @Test
    fun `returns current jwt profile`() {
        val jwt = Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject("user-1")
            .claim("preferred_username", "student.one")
            .claim("email", "student@example.com")
            .claim("name", "Student One")
            .build()
        val authentication = JwtAuthenticationToken(
            jwt,
            listOf(SimpleGrantedAuthority("ROLE_STUDENT")),
        )

        val response = MeController().me(authentication)

        assertEquals("user-1", response.subject)
        assertEquals("student.one", response.username)
        assertEquals("student@example.com", response.email)
        assertEquals("Student One", response.name)
        assertEquals(listOf("STUDENT"), response.roles)
    }
}
