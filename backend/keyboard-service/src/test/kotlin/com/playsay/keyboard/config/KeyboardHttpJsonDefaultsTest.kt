package com.playsay.keyboard.config

import com.playsay.keyboard.KeyboardApiTestFixture
import com.playsay.keyboard.dto.SubmitAnonymousResultRequest
import com.playsay.keyboard.dto.SubmitResultRequest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.http.converter.HttpMessageConverter
import org.springframework.mock.http.MockHttpInputMessage
import org.springframework.test.context.TestPropertySource
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@TestPropertySource(properties = [
    "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://127.0.0.1/test",
    "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1/test/certs",
])
class KeyboardHttpJsonDefaultsTest : KeyboardApiTestFixture() {
    @Autowired private lateinit var handlerAdapter: RequestMappingHandlerAdapter

    @Test
    fun `MVC anonymous payload applies omitted Kotlin defaults`() {
        val request = readRequest(SubmitAnonymousResultRequest::class.java, """
            {"deviceId":"http-defaults-fixture","chordSetId":1,"speedCpm":120.0,"accuracy":1.0,"errors":0,"durationMs":1000}
        """)
        assertEquals(120.0, request.averageCpm)
        assertEquals(1.0, request.cadence)
        assertTrue(request.practiceContext.isEmpty())
        assertTrue(request.perFinger.isEmpty())
        assertTrue(request.focusProblemKeys.isEmpty())
    }

    @Test
    fun `MVC authenticated payload applies omitted Kotlin defaults`() {
        val request = readRequest(SubmitResultRequest::class.java, """
            {"chordSetId":1,"speedCpm":120.0,"accuracy":1.0,"errors":0,"durationMs":1000}
        """)
        assertEquals(120.0, request.averageCpm)
        assertEquals(1.0, request.cadence)
        assertTrue(request.practiceContext.isEmpty())
        assertTrue(request.vocabularyResults.isEmpty())
    }

    private fun <T : Any> readRequest(type: Class<T>, json: String): T {
        val input = MockHttpInputMessage(json.toByteArray()).apply { headers.contentType = MediaType.APPLICATION_JSON }
        @Suppress("UNCHECKED_CAST")
        val converter = handlerAdapter.messageConverters.first { it.canRead(type, MediaType.APPLICATION_JSON) } as HttpMessageConverter<Any>
        return type.cast(converter.read(type, input))
    }
}
