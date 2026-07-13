package com.playsay.registration.dto

import com.fasterxml.jackson.annotation.JsonInclude
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
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

data class ManagedStudentRequest(
    @field:NotBlank
    @field:Size(min = 3, max = 64)
    @field:Pattern(regexp = "^[A-Za-z0-9._-]+$")
    val username: String,
    @field:NotBlank
    @field:Size(max = 120)
    val firstName: String,
    @field:Size(max = 120)
    val lastName: String? = null,
    @field:Email
    @field:Size(max = 320)
    val email: String? = null,
)

data class ManagedStudentResponse(
    val subject: String,
    val username: String,
    val email: String?,
    val firstName: String,
    val lastName: String?,
    val displayName: String,
)

data class ManagedStudentInviteRequest(
    @field:NotBlank
    @field:Size(max = 255)
    val subject: String,
    @field:NotBlank
    @field:Size(max = 320)
    val username: String,
    @field:Email
    @field:Size(max = 320)
    val email: String? = null,
    @field:Size(max = 120)
    val displayName: String? = null,
    val lessonId: UUID,
    @field:NotBlank
    @field:Size(max = 1024)
    val continueUrl: String,
)

data class ManagedStudentInviteResponse(
    val token: String,
    val expiresAt: Instant,
)

data class ManagedStudentInviteLookupResponse(
    val subject: String,
    val username: String,
    val email: String?,
    val displayName: String?,
    val lessonId: UUID,
    val continueUrl: String,
    val expiresAt: Instant,
)

data class ConsumeStudentInviteRequest(
    @field:NotBlank
    @field:Size(max = 255)
    val token: String,
)

data class ConsumeStudentInviteResponse(
    val accessToken: String,
    val refreshToken: String?,
    val idToken: String?,
    val expiresIn: Long,
    val continueUrl: String,
)
