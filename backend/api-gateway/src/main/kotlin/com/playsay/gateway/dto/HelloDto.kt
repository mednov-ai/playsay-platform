package com.playsay.gateway.dto

import java.time.Instant
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

data class HelloResponse(
    val service: String,
    val message: String,
    val timestamp: Instant,
)
