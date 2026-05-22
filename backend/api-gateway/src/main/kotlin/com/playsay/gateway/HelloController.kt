package com.playsay.gateway

import java.time.Instant
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

data class HelloResponse(
    val service: String,
    val message: String,
    val timestamp: Instant,
)

@RestController
class HelloController {
    @GetMapping("/hello")
    fun hello(): HelloResponse =
        HelloResponse(
            service = "api-gateway",
            message = "Play&Say dev pipeline is alive",
            timestamp = Instant.now(),
        )
}

