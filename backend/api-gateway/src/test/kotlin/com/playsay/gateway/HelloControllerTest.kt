package com.playsay.gateway

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class HelloControllerTest {
    @Test
    fun `returns hello response`() {
        val response = HelloController().hello()

        assertEquals("api-gateway", response.service)
    }
}
