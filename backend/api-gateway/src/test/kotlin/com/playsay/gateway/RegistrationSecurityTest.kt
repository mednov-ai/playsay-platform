package com.playsay.gateway

import com.playsay.gateway.dto.ConfirmRegistrationRequest
import com.playsay.gateway.dto.ForgotPasswordRequest
import com.playsay.gateway.dto.ManagedStudentInviteRequest
import com.playsay.gateway.dto.ManagedStudentInviteResponse
import com.playsay.gateway.dto.ManagedStudentProvisionResponse
import com.playsay.gateway.dto.ManagedStudentRequest
import com.playsay.gateway.dto.RegistrationResponse
import com.playsay.gateway.dto.ResetPasswordRequest
import com.playsay.gateway.dto.ResendRegistrationRequest
import com.playsay.gateway.dto.StartRegistrationRequest
import com.playsay.gateway.dto.StudentInviteConsumeRequest
import com.playsay.gateway.dto.StudentInviteConsumeResponse
import com.playsay.gateway.service.RegistrationGateway
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpStatus

@SpringBootTest(
    webEnvironment = WebEnvironment.RANDOM_PORT,
    properties = [
        "spring.datasource.url=jdbc:h2:mem:registration-security;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
class RegistrationSecurityTest @Autowired constructor(
    @param:LocalServerPort private val port: Int,
) {
    @TestConfiguration
    class RegistrationSecurityTestConfig {
        @Bean
        @Primary
        fun registrationGateway(): RegistrationGateway = AnonymousRegistrationGateway()
    }

    @Test
    fun `same-origin api registration start endpoint does not require bearer token`() {
        val response = HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/start"))
                .header("Content-Type", "application/json")
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        """
                        {
                          "email": "student@example.com",
                          "password": "password123",
                          "displayName": "Student",
                          "locale": "en",
                          "returnTo": "https://key.play-and-say.ru/"
                        }
                        """.trimIndent(),
                    ),
                )
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
    }

    @Test
    fun `same-origin api registration validation errors are not converted to unauthorized`() {
        val response = HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/start"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.BAD_REQUEST.value(), response.statusCode(), response.body())
    }

    @Test
    fun `same-origin api password reset endpoints do not require bearer token`() {
        val httpClient = HttpClient.newHttpClient()
        val forgot = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/forgot-password"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""{"email":"student@example.com","locale":"en"}"""))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        val reset = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/reset-password"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""{"email":"student@example.com","code":"123456","newPassword":"River2026!"}"""))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.ACCEPTED.value(), forgot.statusCode(), forgot.body())
        assertEquals(HttpStatus.OK.value(), reset.statusCode(), reset.body())
    }
}

private class AnonymousRegistrationGateway : RegistrationGateway {
    override fun start(request: StartRegistrationRequest, clientAddress: String?): RegistrationResponse =
        RegistrationResponse(status = "CHECK_EMAIL")

    override fun resend(request: ResendRegistrationRequest, clientAddress: String?): RegistrationResponse =
        RegistrationResponse(status = "CHECK_EMAIL")

    override fun confirm(request: ConfirmRegistrationRequest): RegistrationResponse =
        RegistrationResponse(status = "CONFIRMED")

    override fun forgotPassword(request: ForgotPasswordRequest, clientAddress: String?): RegistrationResponse =
        RegistrationResponse(status = "CHECK_EMAIL")

    override fun resetPassword(request: ResetPasswordRequest, clientAddress: String?): RegistrationResponse =
        RegistrationResponse(status = "PASSWORD_RESET")

    override fun createManagedStudent(request: ManagedStudentRequest): ManagedStudentProvisionResponse =
        ManagedStudentProvisionResponse(subject = "student-subject", email = request.email, displayName = request.displayName)

    override fun createManagedStudentInvite(request: ManagedStudentInviteRequest): ManagedStudentInviteResponse =
        ManagedStudentInviteResponse(token = "student-invite-token", expiresAt = Instant.parse("2026-07-09T12:00:00Z"))

    override fun consumeStudentInvite(request: StudentInviteConsumeRequest): StudentInviteConsumeResponse =
        StudentInviteConsumeResponse(
            accessToken = "access-token",
            refreshToken = "refresh-token",
            idToken = "id-token",
            expiresIn = 300,
            continueUrl = "/lessons/lesson-id/classroom",
        )
}
