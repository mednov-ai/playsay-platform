package com.playsay.gateway.dto


data class MeResponse(
    val subject: String,
    val username: String?,
    val email: String?,
    val name: String?,
    val roles: List<String>,
)
