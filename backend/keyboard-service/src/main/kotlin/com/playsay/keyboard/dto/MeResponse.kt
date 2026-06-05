package com.playsay.keyboard.dto

data class MeResponse(
    val subject: String,
    val username: String?,
    val email: String?,
    val roles: List<String>,
)
