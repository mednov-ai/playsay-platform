package com.playsay.gateway.config

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.repo.AppUserRepo
import java.time.Instant
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class StaleJwtFilterTest {
    @AfterTest
    fun clearSecurityContext() {
        SecurityContextHolder.clearContext()
    }

    @Test
    fun `rejects token issued before latest role change`() {
        val repo = mock(AppUserRepo::class.java)
        val changedAt = Instant.parse("2026-07-14T10:00:00Z")
        `when`(repo.findByKeycloakSubject("admin-1")).thenReturn(
            AppUserEntity(keycloakSubject = "admin-1", roles = "TEACHER", rolesChangedAt = changedAt),
        )
        SecurityContextHolder.getContext().authentication = authentication(changedAt.minusSeconds(1))
        val response = MockHttpServletResponse()
        var continued = false

        StaleJwtFilter(repo).doFilter(MockHttpServletRequest(), response) { _, _ -> continued = true }

        assertEquals(401, response.status)
        assertFalse(continued)
    }

    @Test
    fun `allows token issued after latest role change`() {
        val repo = mock(AppUserRepo::class.java)
        val changedAt = Instant.parse("2026-07-14T10:00:00Z")
        `when`(repo.findByKeycloakSubject("admin-1")).thenReturn(
            AppUserEntity(keycloakSubject = "admin-1", roles = "ADMIN", rolesChangedAt = changedAt),
        )
        SecurityContextHolder.getContext().authentication = authentication(changedAt.plusSeconds(1))
        val response = MockHttpServletResponse()
        var continued = false

        StaleJwtFilter(repo).doFilter(MockHttpServletRequest(), response) { _, _ -> continued = true }

        assertEquals(200, response.status)
        assertTrue(continued)
    }

    @Test
    fun `combined admin teacher profile still rejects stale token`() {
        val repo = mock(AppUserRepo::class.java)
        val changedAt = Instant.parse("2026-07-14T10:00:00Z")
        `when`(repo.findByKeycloakSubject("admin-1")).thenReturn(
            AppUserEntity(keycloakSubject = "admin-1", roles = "ADMIN,TEACHER", rolesChangedAt = changedAt),
        )
        SecurityContextHolder.getContext().authentication = authentication(changedAt.minusMillis(1))
        val response = MockHttpServletResponse()
        var continued = false

        StaleJwtFilter(repo).doFilter(MockHttpServletRequest(), response) { _, _ -> continued = true }

        assertEquals(401, response.status)
        assertFalse(continued)
    }

    private fun authentication(issuedAt: Instant): JwtAuthenticationToken = JwtAuthenticationToken(
        Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject("admin-1")
            .issuedAt(issuedAt)
            .expiresAt(issuedAt.plusSeconds(3600))
            .build(),
    )
}
