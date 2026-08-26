package com.playsay.registration.dto

import com.fasterxml.jackson.annotation.JsonInclude
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

data class StartRegistrationRequest(
    @field:Email
    @field:NotBlank
    @field:Size(max = 320)
    val email: String,
    @field:NotBlank
    @field:Size(min = 8, max = 128)
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

data class ForgotPasswordRequest(
    @field:Email
    @field:NotBlank
    @field:Size(max = 320)
    val email: String,
    @field:Size(max = 16)
    val locale: String? = null,
    @field:Size(max = 1024)
    val returnTo: String? = null,
)

data class ResetPasswordRequest(
    @field:Email
    @field:NotBlank
    @field:Size(max = 320)
    val email: String,
    @field:NotBlank
    @field:Size(min = 6, max = 12)
    val code: String,
    @field:NotBlank
    @field:Size(min = 8, max = 128)
    val newPassword: String,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class RegistrationResponse(
    val status: String,
    val continueUrl: String? = null,
)
data class LessonIdentityResolveRequest(
    @field:Email @field:NotBlank @field:Size(max = 320)
    val email: String,
)

data class LessonIdentityResolveResponse(
    val subject: String,
    val email: String,
    val displayName: String?,
    val roles: Set<String>,
)

data class LessonAuthAssertionCreateRequest(
    @field:NotBlank @field:Size(max = 255)
    val subject: String,
    val browserAttemptId: UUID,
    @field:NotBlank @field:Size(max = 128)
    val clientId: String,
    @field:NotBlank @field:Size(max = 512)
    val issuer: String,
    @field:NotBlank @field:Size(max = 1024)
    val callback: String,
    val rememberMe: Boolean = false,
)

data class LessonAuthAssertionCreateResponse(
    val handle: String,
    val expiresAt: Instant,
)

data class LessonAuthAssertionRedeemRequest(
    @field:NotBlank @field:Size(max = 255)
    val handle: String,
    @field:NotBlank @field:Size(max = 128)
    val clientId: String,
    @field:NotBlank @field:Size(max = 512)
    val issuer: String,
    @field:NotBlank @field:Size(max = 1024)
    val callback: String,
)

data class LessonAuthAssertionRedeemResponse(
    val subject: String,
    val rememberMe: Boolean,
)
