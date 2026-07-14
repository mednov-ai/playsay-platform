package com.playsay.gateway.config

import java.time.Clock
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class TimeConfig {
    @Bean
    fun systemClock(): Clock = Clock.systemUTC()
}
