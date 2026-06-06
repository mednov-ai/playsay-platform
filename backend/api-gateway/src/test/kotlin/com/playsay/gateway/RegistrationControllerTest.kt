package com.playsay.gateway

import com.playsay.gateway.controller.RegistrationController
import com.playsay.gateway.dto.ConfirmRegistrationRequest
import com.playsay.gateway.dto.ForgotPasswordRequest
import com.playsay.gateway.dto.RegistrationResponse
import com.playsay.gateway.dto.ResetPasswordRequest
import com.playsay.gateway.dto.ResendRegistrationRequest
import com.playsay.gateway.dto.StartRegistrationRequest
import com.playsay.gateway.service.RegistrationGateway
import org.springframework.mock.web.MockHttpServletRequest
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
            MockHttpServletRequest().apply {
                addHeader("X-Forwarded-For", "198.51.100.10")
            },
        )

        assertEquals(RegistrationResponse(status = "CHECK_EMAIL"), response)
        assertEquals("student@example.com", gateway.started.single().email)
        assertEquals("https://key.play-and-say.ru/", gateway.started.single().returnTo)
        assertEquals("198.51.100.10", gateway.clientAddresses.single())
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
            MockHttpServletRequest().apply {
                remoteAddr = "203.0.113.20"
            },
        )
        val reset = controller.resetPassword(
            ResetPasswordRequest(
                email = "student@example.com",
                code = "123456",
                newPassword = "River2026!",
            ),
            MockHttpServletRequest().apply {
                addHeader("X-Real-IP", "203.0.113.21")
            },
        )

        assertEquals(RegistrationResponse(status = "CHECK_EMAIL"), forgot)
        assertEquals(RegistrationResponse(status = "PASSWORD_RESET"), reset)
        assertEquals("student@example.com", gateway.forgotPasswordRequests.single().email)
        assertEquals("123456", gateway.resetPasswordRequests.single().code)
        assertEquals(listOf<String?>("203.0.113.20", "203.0.113.21"), gateway.clientAddresses)
    }
}

private class RecordingRegistrationGateway : RegistrationGateway {
    val started = mutableListOf<StartRegistrationRequest>()
    val resent = mutableListOf<ResendRegistrationRequest>()
    val confirmed = mutableListOf<ConfirmRegistrationRequest>()
    val forgotPasswordRequests = mutableListOf<ForgotPasswordRequest>()
    val resetPasswordRequests = mutableListOf<ResetPasswordRequest>()
    val clientAddresses = mutableListOf<String?>()

    override fun start(request: StartRegistrationRequest, clientAddress: String?): RegistrationResponse {
        started.add(request)
        clientAddresses.add(clientAddress)
        return RegistrationResponse(status = "CHECK_EMAIL")
    }

    override fun resend(request: ResendRegistrationRequest, clientAddress: String?): RegistrationResponse {
        resent.add(request)
        clientAddresses.add(clientAddress)
        return RegistrationResponse(status = "CHECK_EMAIL")
    }

    override fun confirm(request: ConfirmRegistrationRequest): RegistrationResponse {
        confirmed.add(request)
        return RegistrationResponse(status = "CONFIRMED", continueUrl = "https://key.play-and-say.ru/")
    }

    override fun forgotPassword(request: ForgotPasswordRequest, clientAddress: String?): RegistrationResponse {
        forgotPasswordRequests.add(request)
        clientAddresses.add(clientAddress)
        return RegistrationResponse(status = "CHECK_EMAIL")
    }

    override fun resetPassword(request: ResetPasswordRequest, clientAddress: String?): RegistrationResponse {
        resetPasswordRequests.add(request)
        clientAddresses.add(clientAddress)
        return RegistrationResponse(status = "PASSWORD_RESET")
    }
}
