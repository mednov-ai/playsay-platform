package com.playsay.gateway

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.EmailDeliveryAdminGateway
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.springframework.http.HttpStatus
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class EmailDeliveryAdminGatewayTest {
    private val gateway = EmailDeliveryAdminGateway("http://127.0.0.1:1", "test-token")

    @Test
    fun `email journal requires admin role`() {
        val error = assertFailsWith<ProjectResponseException> {
            gateway.requireAdmin(authentication("student", MetaData.Authorities.STUDENT))
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
        assertEquals(MetaData.ErrorCodes.ADMIN_ROLE_REQUIRED, error.errorCode)
    }

    @Test
    fun `admin role can access email journal facade`() {
        gateway.requireAdmin(authentication("admin", MetaData.Authorities.ADMIN))
    }

    private fun authentication(subject: String, authority: String): JwtAuthenticationToken {
        val issuedAt = Instant.now().minusSeconds(5)
        val jwt = Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject(subject)
            .issuedAt(issuedAt)
            .expiresAt(issuedAt.plusSeconds(3_600))
            .build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(authority)))
    }
}
