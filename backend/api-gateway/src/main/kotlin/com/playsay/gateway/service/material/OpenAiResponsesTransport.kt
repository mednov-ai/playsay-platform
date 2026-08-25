package com.playsay.gateway.service.material

import org.springframework.stereotype.Component

typealias OpenAiResponsesTransport = com.playsay.openai.OpenAiResponsesTransport
typealias OpenAiTransportException = com.playsay.openai.OpenAiTransportException

@Component
class JavaOpenAiResponsesTransport : com.playsay.openai.JavaOpenAiResponsesTransport()
