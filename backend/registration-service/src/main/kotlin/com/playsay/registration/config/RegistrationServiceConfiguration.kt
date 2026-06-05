package com.playsay.registration.config

import java.net.http.HttpClient
import java.time.Clock
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class RegistrationServiceConfiguration {
    @Bean
    fun registrationClock(): Clock = Clock.systemUTC()

    @Bean
    fun registrationHttpClient(): HttpClient = HttpClient.newHttpClient()
}
