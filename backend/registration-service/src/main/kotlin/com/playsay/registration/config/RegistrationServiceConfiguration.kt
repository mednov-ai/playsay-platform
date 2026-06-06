package com.playsay.registration.config

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.registration.client.EmailServiceRegistrationEmailClient
import com.playsay.registration.client.KeycloakAdminRegistrationClient
import com.playsay.registration.service.KeycloakRegistrationClient
import com.playsay.registration.service.RegistrationEmailClient
import java.net.http.HttpClient
import java.time.Clock
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class RegistrationServiceConfiguration {
    @Bean
    fun registrationClock(): Clock = Clock.systemUTC()

    @Bean
    fun registrationHttpClient(): HttpClient = HttpClient.newHttpClient()

    @Bean
    @ConditionalOnMissingBean(ObjectMapper::class)
    fun registrationObjectMapper(): ObjectMapper =
        jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

    @Bean
    @ConditionalOnMissingBean(KeycloakRegistrationClient::class)
    fun keycloakAdminRegistrationClient(
        httpClient: HttpClient,
        objectMapper: ObjectMapper,
        @Value("\${playsay.registration.keycloak.base-url}") keycloakBaseUrl: String,
        @Value("\${playsay.registration.keycloak.realm}") realm: String,
        @Value("\${playsay.registration.keycloak.client-id}") clientId: String,
        @Value("\${playsay.registration.keycloak.client-secret}") clientSecret: String,
    ): KeycloakRegistrationClient =
        KeycloakAdminRegistrationClient(
            httpClient = httpClient,
            objectMapper = objectMapper,
            keycloakBaseUrl = keycloakBaseUrl,
            realm = realm,
            clientId = clientId,
            clientSecret = clientSecret,
        )

    @Bean
    @ConditionalOnMissingBean(RegistrationEmailClient::class)
    fun emailServiceRegistrationEmailClient(
        httpClient: HttpClient,
        objectMapper: ObjectMapper,
        @Value("\${playsay.registration.email-service.base-url}") emailServiceBaseUrl: String,
        @Value("\${playsay.registration.email-service.service-token}") serviceToken: String,
    ): RegistrationEmailClient =
        EmailServiceRegistrationEmailClient(
            httpClient = httpClient,
            objectMapper = objectMapper,
            emailServiceBaseUrl = emailServiceBaseUrl,
            serviceToken = serviceToken,
        )
}
