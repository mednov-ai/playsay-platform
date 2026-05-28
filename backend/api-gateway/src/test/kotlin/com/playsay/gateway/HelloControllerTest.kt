package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class HelloControllerTest {
    @Test
    fun `returns hello response`() {
        val response = HelloController().hello()

        assertEquals("api-gateway", response.service)
    }
}
