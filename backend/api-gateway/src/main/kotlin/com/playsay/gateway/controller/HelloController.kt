package com.playsay.gateway.controller

import java.time.Instant
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*

@RestController
@Tag(name = "Dev")
class HelloController {
    @GetMapping("/hello", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getHello",
        summary = "Dev health message",
        description = "Returns a small public payload used by smoke tests.",
    )
    fun hello(): HelloResponse =
        HelloResponse(
            service = "api-gateway",
            message = "Honey School dev pipeline is alive",
            timestamp = Instant.now(),
        )
}
