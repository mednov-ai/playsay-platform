package com.playsay.gateway.dto

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

data class RegistrationResponse(
    val status: String,
    val continueUrl: String? = null,
)

data class ManagedStudentProvisionResponse(
    val subject: String,
    val email: String,
    val displayName: String?,
)

data class ManagedStudentInviteRequest(
    val subject: String,
    val email: String,
    val displayName: String?,
    val lessonId: UUID,
    val continueUrl: String,
)

data class ManagedStudentInviteResponse(
    val token: String,
    val expiresAt: Instant,
)

data class StudentInviteConsumeRequest(
    @field:NotBlank
    @field:Size(max = 255)
    val token: String,
)

data class StudentInviteConsumeResponse(
    val accessToken: String,
    val refreshToken: String?,
    val idToken: String?,
    val expiresIn: Long,
    val continueUrl: String,
)
