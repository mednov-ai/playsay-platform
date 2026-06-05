package com.playsay.email.dto

import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class TransactionalEmailRequest(
    @field:Email
    @field:NotBlank
    @field:Size(max = 320)
    val to: String,
    @field:NotBlank
    @field:Size(max = 120)
    val templateKey: String,
    @field:Size(max = 16)
    val locale: String? = null,
    @field:NotBlank
    @field:Size(max = 255)
    val idempotencyKey: String,
    val model: Map<String, String?> = emptyMap(),
)

data class TransactionalEmailResponse(
    val status: String,
)
