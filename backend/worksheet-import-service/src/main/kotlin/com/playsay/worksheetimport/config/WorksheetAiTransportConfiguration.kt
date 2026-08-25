package com.playsay.worksheetimport.config

import com.playsay.openai.JavaOpenAiResponsesTransport
import com.playsay.openai.OpenAiResponsesTransport
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class WorksheetAiTransportConfiguration {
    @Bean fun worksheetOpenAiResponsesTransport(): OpenAiResponsesTransport = JavaOpenAiResponsesTransport()
}
