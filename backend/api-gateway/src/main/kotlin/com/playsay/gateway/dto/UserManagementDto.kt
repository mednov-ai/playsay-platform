package com.playsay.gateway.dto

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

data class UserManagementUser(
    val id: UUID,
    val subject: String,
    val username: String?,
    val email: String?,
    val displayName: String?,
    val roles: List<String>,
    val status: String,
    val primaryTeacher: TeacherDirectoryEntry? = null,
    val activeDelegates: List<TeacherDirectoryEntry> = emptyList(),
    @field:Schema(accessMode = Schema.AccessMode.READ_ONLY)
    val lessonTranslationAllowed: Boolean = false,
    val connectionRoutePreference: ConnectionRoutePreference = ConnectionRoutePreference.AUTO,
)

data class TeacherDirectoryEntry(
    val subject: String,
    val displayName: String,
)

data class TeacherStudentResponse(
    val student: UserManagementUser,
    val access: String,
)

data class CreateUserManagementUserRequest(
    @field:NotBlank @field:Size(min = 3, max = 64)
    @field:Pattern(regexp = "^[A-Za-z0-9._-]+$")
    val username: String,
    @field:NotBlank @field:Size(max = 120)
    val firstName: String,
    @field:Size(max = 120)
    val lastName: String? = null,
    @field:Email @field:Size(max = 320)
    val email: String? = null,
    @field:NotEmpty
    val roles: Set<String>,
    val primaryTeacherSubject: String? = null,
)

data class UpdateUserRolesRequest(
    @field:NotEmpty
    val roles: Set<String>,
    val replacementTeacherSubject: String? = null,
)

data class AssignPrimaryTeacherRequest(
    @field:NotBlank
    val teacherSubject: String,
)

data class AttachStudentRequest(
    @field:NotBlank @field:Size(max = 320)
    val usernameOrEmail: String,
)

data class UpdateStudentLessonTranslationPermissionRequest(
    val allowed: Boolean,
)

data class CreateDelegationRequest(
    val primaryTeacherSubject: String? = null,
    @field:NotEmpty
    val delegateTeacherSubjects: Set<String>,
    @field:NotEmpty
    val studentSubjects: Set<String>,
    @field:Schema(type = "string", format = "date")
    val startsAt: LocalDate,
    @field:Schema(type = "string", format = "date")
    val endsAt: LocalDate,
)

data class TeacherDelegationResponse(
    val id: UUID,
    val primaryTeacher: TeacherDirectoryEntry,
    val delegateTeacher: TeacherDirectoryEntry,
    val students: List<UserManagementUser>,
    val startsAt: Instant,
    val endsAt: Instant,
    val status: String,
    val createdBySubject: String,
    val createdAt: Instant,
    val revokedAt: Instant? = null,
)

data class UserDeletionOperationResponse(
    val operationId: UUID,
    val targetSubject: String,
    val status: String,
    val errorCode: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val completedAt: Instant? = null,
)
