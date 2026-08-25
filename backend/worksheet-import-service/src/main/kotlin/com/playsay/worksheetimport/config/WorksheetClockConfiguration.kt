package com.playsay.worksheetimport.config

import java.time.Clock
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class WorksheetClockConfiguration {
    @Bean fun worksheetClock(): Clock = Clock.systemUTC()
}
