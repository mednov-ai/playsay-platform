package com.playsay.worksheetimport.config

import com.playsay.worksheetimport.service.WorksheetSessionAccessPolicy
import java.time.Instant
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class WorksheetImportSecurityTest {
    @Test
    fun `requires configured service credential for every import route`() {
        val filter = WorksheetServiceTokenFilter(WorksheetImportProperties(serviceToken = "service-secret"))
        val missing = response(filter, null)
        val wrong = response(filter, "wrong")
        val valid = response(filter, "service-secret")

        assertTrue(missing.status == 401 && wrong.status == 401)
        assertTrue(valid.status < 400)
    }

    @Test
    fun `owner and admin access is indistinguishable while students cannot create`() {
        val policy = WorksheetSessionAccessPolicy()
        val owner = authentication("teacher-a", "TEACHER")
        val stranger = authentication("teacher-b", "TEACHER")
        val admin = authentication("admin", "ADMIN")
        val student = authentication("student", "STUDENT")

        assertTrue(policy.canCreate(owner))
        assertFalse(policy.canCreate(student))
        assertTrue(policy.canAccess(owner, "teacher-a"))
        assertFalse(policy.canAccess(stranger, "teacher-a"))
        assertTrue(policy.canAccess(admin, "teacher-a"))
    }

    private fun response(filter: WorksheetServiceTokenFilter, token: String?): MockHttpServletResponse {
        val request = MockHttpServletRequest("GET", "/internal/worksheet-imports/00000000-0000-0000-0000-000000000000")
        token?.let { request.addHeader(WORKSHEET_SERVICE_TOKEN_HEADER, it) }
        return MockHttpServletResponse().also { filter.doFilter(request, it, MockFilterChain()) }
    }

    private fun authentication(subject: String, role: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("test")
            .header("alg", "none")
            .subject(subject)
            .issuedAt(Instant.now())
            .expiresAt(Instant.now().plusSeconds(60))
            .build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority("ROLE_$role")))
    }
}
