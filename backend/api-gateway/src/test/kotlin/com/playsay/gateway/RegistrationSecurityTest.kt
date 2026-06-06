package com.playsay.gateway

import com.playsay.gateway.dto.ConfirmRegistrationRequest
import com.playsay.gateway.dto.RegistrationResponse
import com.playsay.gateway.dto.ResendRegistrationRequest
import com.playsay.gateway.dto.StartRegistrationRequest
import com.playsay.gateway.service.RegistrationGateway
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
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
}

private class AnonymousRegistrationGateway : RegistrationGateway {
    override fun start(request: StartRegistrationRequest): RegistrationResponse =
        RegistrationResponse(status = "CHECK_EMAIL")

    override fun resend(request: ResendRegistrationRequest): RegistrationResponse =
        RegistrationResponse(status = "CHECK_EMAIL")

    override fun confirm(request: ConfirmRegistrationRequest): RegistrationResponse =
        RegistrationResponse(status = "CONFIRMED")
}
