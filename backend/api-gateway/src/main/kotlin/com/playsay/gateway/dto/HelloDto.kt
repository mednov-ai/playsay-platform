package com.playsay.gateway.dto

import java.time.Instant

data class HelloResponse(
    val service: String,
    val message: String,
    val timestamp: Instant,
)
