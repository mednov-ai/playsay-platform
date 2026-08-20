package com.playsay.gateway

import com.playsay.gateway.controller.AuthenticationMethodsController
import com.playsay.gateway.dto.AuthenticationMethodsResponse
import com.playsay.gateway.dto.PasskeyCredentialResponse
import com.playsay.gateway.dto.RenamePasskeyRequest
import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.service.RegistrationService
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class AuthenticationMethodsControllerTest {
    private val gateway = CapturingAuthenticationMethodsGateway()
    private val controller = AuthenticationMethodsController(RegistrationService(gateway))

    @Test
    fun `all operations derive owner subject from jwt`() {
        val authentication = authentication("owner-subject")

        controller.get(authentication)
        controller.rename(authentication, "credential-1", RenamePasskeyRequest("Phone"))
        controller.delete(authentication, "credential-1")

        assertEquals(
            listOf(
                "get:owner-subject",
                "rename:owner-subject:credential-1:Phone",
                "delete:owner-subject:credential-1",
            ),
            gateway.calls,
        )
    }

    private fun authentication(subject: String): JwtAuthenticationToken = JwtAuthenticationToken(
        Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject(subject)
            .issuedAt(Instant.parse("2026-08-12T08:00:00Z"))
            .expiresAt(Instant.parse("2026-08-12T09:00:00Z"))
            .build(),
    )
}

private class CapturingAuthenticationMethodsGateway : RegistrationGateway {
    val calls = mutableListOf<String>()
    private val result = AuthenticationMethodsResponse(
        hasPassword = true,
        passkeys = listOf(PasskeyCredentialResponse("credential-1", "Phone", Instant.parse("2026-08-12T08:00:00Z"))),
    )

    override fun authenticationMethods(subject: String): AuthenticationMethodsResponse = result.also {
        calls += "get:$subject"
    }

    override fun renamePasskey(
        subject: String,
        credentialId: String,
        request: RenamePasskeyRequest,
    ): AuthenticationMethodsResponse = result.also {
        calls += "rename:$subject:$credentialId:${request.label}"
    }

    override fun deletePasskey(subject: String, credentialId: String): AuthenticationMethodsResponse = result.also {
        calls += "delete:$subject:$credentialId"
    }

    override fun start(request: com.playsay.gateway.dto.StartRegistrationRequest, clientAddress: String?) = error("Not used")
    override fun resend(request: com.playsay.gateway.dto.ResendRegistrationRequest, clientAddress: String?) = error("Not used")
    override fun confirm(request: com.playsay.gateway.dto.ConfirmRegistrationRequest) = error("Not used")
    override fun forgotPassword(request: com.playsay.gateway.dto.ForgotPasswordRequest, clientAddress: String?) = error("Not used")
    override fun resetPassword(request: com.playsay.gateway.dto.ResetPasswordRequest, clientAddress: String?) = error("Not used")
    override fun createManagedStudent(request: com.playsay.gateway.dto.ManagedStudentRequest) = error("Not used")
    override fun createManagedStudentInvite(request: com.playsay.contract.registration.model.ManagedStudentInviteRequest) = error("Not used")
    override fun lookupManagedStudentInvite(request: com.playsay.gateway.dto.StudentInviteConsumeRequest, clientAddress: String?) = error("Not used")
    override fun consumeStudentInvite(request: com.playsay.gateway.dto.StudentInviteConsumeRequest, clientAddress: String?) = error("Not used")
}
