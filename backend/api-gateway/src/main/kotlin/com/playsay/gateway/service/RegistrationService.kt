package com.playsay.gateway.service

import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.dto.*
import org.springframework.stereotype.Service

@Service
class RegistrationService(
    private val gateway: RegistrationGateway,
) {
    fun start(request: StartRegistrationRequest, clientAddress: String?): RegistrationResponse =
        gateway.start(request, clientAddress)

    fun resend(request: ResendRegistrationRequest, clientAddress: String?): RegistrationResponse =
        gateway.resend(request, clientAddress)

    fun confirm(request: ConfirmRegistrationRequest): RegistrationResponse = gateway.confirm(request)

    fun forgotPassword(request: ForgotPasswordRequest, clientAddress: String?): RegistrationResponse =
        gateway.forgotPassword(request, clientAddress)

    fun resetPassword(request: ResetPasswordRequest, clientAddress: String?): RegistrationResponse =
        gateway.resetPassword(request, clientAddress)

    fun authenticationMethods(subject: String): AuthenticationMethodsResponse = gateway.authenticationMethods(subject)

    fun renamePasskey(
        subject: String,
        credentialId: String,
        request: RenamePasskeyRequest,
    ): AuthenticationMethodsResponse = gateway.renamePasskey(subject, credentialId, request)

    fun deletePasskey(subject: String, credentialId: String): AuthenticationMethodsResponse =
        gateway.deletePasskey(subject, credentialId)
}
