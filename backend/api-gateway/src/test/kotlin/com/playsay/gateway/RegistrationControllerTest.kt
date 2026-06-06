package com.playsay.gateway

import com.playsay.gateway.controller.RegistrationController
import com.playsay.gateway.dto.ConfirmRegistrationRequest
import com.playsay.gateway.dto.ForgotPasswordRequest
import com.playsay.gateway.dto.RegistrationResponse
import com.playsay.gateway.dto.ResetPasswordRequest
import com.playsay.gateway.dto.ResendRegistrationRequest
import com.playsay.gateway.dto.StartRegistrationRequest
import com.playsay.gateway.service.RegistrationGateway
import kotlin.test.Test
import kotlin.test.assertEquals

class RegistrationControllerTest {
    @Test
    fun `start forwards public request to registration service`() {
        val gateway = RecordingRegistrationGateway()
        val controller = RegistrationController(gateway)

        val response = controller.start(
            StartRegistrationRequest(
                email = "student@example.com",
                password = "password123",
                displayName = "Student",
                locale = "en",
                returnTo = "https://key.play-and-say.ru/",
            ),
        )

        assertEquals(RegistrationResponse(status = "CHECK_EMAIL"), response)
        assertEquals("student@example.com", gateway.started.single().email)
        assertEquals("https://key.play-and-say.ru/", gateway.started.single().returnTo)
    }

    @Test
    fun `confirm returns continue url from registration service`() {
        val gateway = RecordingRegistrationGateway()
        val controller = RegistrationController(gateway)

        val response = controller.confirm(ConfirmRegistrationRequest(token = "token-1"))

        assertEquals(RegistrationResponse(status = "CONFIRMED", continueUrl = "https://key.play-and-say.ru/"), response)
        assertEquals("token-1", gateway.confirmed.single().token)
    }

    @Test
    fun `password reset endpoints forward public requests to registration service`() {
        val gateway = RecordingRegistrationGateway()
        val controller = RegistrationController(gateway)

        val forgot = controller.forgotPassword(
            ForgotPasswordRequest(
                email = "student@example.com",
                locale = "en",
                returnTo = "https://online.play-and-say.ru/",
            ),
        )
        val reset = controller.resetPassword(
            ResetPasswordRequest(
                email = "student@example.com",
                code = "123456",
                newPassword = "River2026!",
            ),
        )

        assertEquals(RegistrationResponse(status = "CHECK_EMAIL"), forgot)
        assertEquals(RegistrationResponse(status = "PASSWORD_RESET"), reset)
        assertEquals("student@example.com", gateway.forgotPasswordRequests.single().email)
        assertEquals("123456", gateway.resetPasswordRequests.single().code)
    }
}

private class RecordingRegistrationGateway : RegistrationGateway {
    val started = mutableListOf<StartRegistrationRequest>()
    val resent = mutableListOf<ResendRegistrationRequest>()
    val confirmed = mutableListOf<ConfirmRegistrationRequest>()
    val forgotPasswordRequests = mutableListOf<ForgotPasswordRequest>()
    val resetPasswordRequests = mutableListOf<ResetPasswordRequest>()

    override fun start(request: StartRegistrationRequest): RegistrationResponse {
        started.add(request)
        return RegistrationResponse(status = "CHECK_EMAIL")
    }

    override fun resend(request: ResendRegistrationRequest): RegistrationResponse {
        resent.add(request)
        return RegistrationResponse(status = "CHECK_EMAIL")
    }

    override fun confirm(request: ConfirmRegistrationRequest): RegistrationResponse {
        confirmed.add(request)
        return RegistrationResponse(status = "CONFIRMED", continueUrl = "https://key.play-and-say.ru/")
    }

    override fun forgotPassword(request: ForgotPasswordRequest): RegistrationResponse {
        forgotPasswordRequests.add(request)
        return RegistrationResponse(status = "CHECK_EMAIL")
    }

    override fun resetPassword(request: ResetPasswordRequest): RegistrationResponse {
        resetPasswordRequests.add(request)
        return RegistrationResponse(status = "PASSWORD_RESET")
    }
}
