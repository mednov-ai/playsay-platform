package com.playsay.gateway.dto

import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class StartRegistrationRequest(
    @field:Email
    @field:NotBlank
    @field:Size(max = 320)
    val email: String,
    @field:NotBlank
    @field:Size(min = 8, max = 200)
    val password: String,
    @field:Size(max = 120)
    val displayName: String? = null,
    @field:Size(max = 16)
    val locale: String? = null,
    @field:Size(max = 1024)
    val returnTo: String? = null,
)

data class ResendRegistrationRequest(
    @field:Email
    @field:NotBlank
    @field:Size(max = 320)
    val email: String,
    @field:Size(max = 16)
    val locale: String? = null,
    @field:Size(max = 1024)
    val returnTo: String? = null,
)

data class ConfirmRegistrationRequest(
    @field:NotBlank
    @field:Size(max = 255)
    val token: String,
)

data class RegistrationResponse(
    val status: String,
    val continueUrl: String? = null,
)
