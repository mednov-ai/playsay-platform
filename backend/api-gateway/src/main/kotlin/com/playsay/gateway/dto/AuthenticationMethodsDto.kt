package com.playsay.gateway.dto

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

data class AuthenticationMethodsResponse(
    val hasPassword: Boolean,
    val passkeys: List<PasskeyCredentialResponse>,
)

data class PasskeyCredentialResponse(
    @field:Schema(description = "Opaque credential identifier usable only by self-service endpoints.")
    val id: String,
    val label: String?,
    val createdAt: Instant?,
)

data class RenamePasskeyRequest(
    @field:NotBlank
    @field:Size(max = 64)
    val label: String,
)
