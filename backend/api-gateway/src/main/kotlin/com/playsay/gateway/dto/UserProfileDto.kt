package com.playsay.gateway.dto

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.time.Instant
import java.time.LocalDate

enum class ConnectionRoutePreference {
    AUTO,
    RF,
}

data class UserProfileResponse(
    val subject: String,
    val username: String?,
    val email: String?,
    val name: String?,
    val roles: List<String>,
    val displayName: String?,
    val locale: String?,
    val countryCode: String?,
    val timezone: String?,
    val learningGoal: String?,
    val connectionRoutePreference: ConnectionRoutePreference = ConnectionRoutePreference.AUTO,
    val updatedAt: Instant,
    val managedByTeacher: Boolean = false,
    @field:Schema(type = "string", format = "date", nullable = true)
    val birthDate: LocalDate? = null,
    @field:Schema(accessMode = Schema.AccessMode.READ_ONLY)
    val lessonTranslationAllowed: Boolean = false,
)

data class UpdateUserProfileRequest(
    @field:Schema(maxLength = 120)
    val displayName: String? = null,
    @field:Schema(maxLength = 16)
    val locale: String? = null,
    @field:Schema(maxLength = 2, nullable = true, description = "ISO-3166 alpha-2 country code.")
    val countryCode: String? = null,
    @field:Schema(maxLength = 64)
    val timezone: String? = null,
    @field:Schema(maxLength = 500)
    val learningGoal: String? = null,
    val connectionRoutePreference: ConnectionRoutePreference? = null,
    @field:Schema(type = "string", format = "date", nullable = true)
    val birthDate: LocalDate? = null,
)

data class UpdateConnectionRoutePreferenceRequest(
    val connectionRoutePreference: ConnectionRoutePreference,
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
