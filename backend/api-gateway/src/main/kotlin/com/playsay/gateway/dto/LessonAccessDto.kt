package com.playsay.gateway.dto

import com.fasterxml.jackson.annotation.JsonInclude
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

data class LessonAccessStartRequest(
    @field:NotBlank @field:Size(max = 255)
    val token: String,
)

data class LessonCompactAccessStartRequest(
    @field:NotBlank @field:Size(min = 16, max = 16)
    val alias: String,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class LessonAccessAttemptResponse(
    val attemptId: UUID,
    val attemptSecret: String? = null,
    val status: String,
    val lessonId: UUID? = null,
    val opensAt: Instant? = null,
    val retryAfterSeconds: Long? = null,
    val authorizationUrl: String? = null,
)

data class LessonEmailCodeRequest(
    @field:Email @field:NotBlank @field:Size(max = 320)
    val email: String,
    @field:Size(max = 16)
    val locale: String? = null,
)

data class LessonEmailCodeVerifyRequest(
    @field:NotBlank @field:Size(min = 6, max = 12)
    val code: String,
    val rememberMe: Boolean = false,
)

data class LessonLobbyRequest(
    @field:NotBlank @field:Size(max = 120)
    val displayLabel: String,
)

data class LessonRememberedEntryRequest(val rememberMe: Boolean = true)

data class LessonAccessStatusResponse(val status: String)

data class LessonAccessLinkResponse(
    val lessonId: UUID,
    val url: String,
    val alias: String,
    val defaultOrigin: String,
    val urls: LessonAccessLinkUrls,
    val revision: Long,
    val createdAt: Instant,
    val revokedAt: Instant? = null,
)

data class LessonAccessLinkUrls(
    val ru: String,
    val school: String,
)

data class LessonAdmissionResponse(
    val subject: String,
    val status: String,
    val revision: Long,
    val admissionMethod: String?,
    val updatedAt: Instant,
)

data class LessonLobbyEntryResponse(
    val attemptId: UUID,
    val displayLabel: String,
    val createdAt: Instant,
    val expiresAt: Instant,
)

data class LessonAdmissionOverviewResponse(
    val lessonId: UUID,
    val pendingLobby: List<LessonLobbyEntryResponse>,
    val admissions: List<LessonAdmissionResponse>,
)

data class LessonLobbyDecisionRequest(
    @field:NotBlank @field:Size(max = 255)
    val studentSubject: String,
    val expectedRevision: Long? = null,
)

data class LessonAdmissionActionRequest(val expectedRevision: Long? = null)

data class LessonIdentityResolveRequest(val email: String)
data class LessonIdentityResolveResponse(
    val subject: String,
    val email: String,
    val displayName: String?,
    val roles: Set<String>,
)

data class LessonAuthAssertionRequest(
    val subject: String,
    val browserAttemptId: UUID,
    val clientId: String,
    val issuer: String,
    val callback: String,
    val rememberMe: Boolean,
)

data class LessonAuthAssertionResponse(val handle: String, val expiresAt: Instant)
