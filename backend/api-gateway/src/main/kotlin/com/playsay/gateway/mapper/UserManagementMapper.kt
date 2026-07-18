package com.playsay.gateway.mapper

import com.playsay.gateway.dto.TeacherDirectoryEntry
import com.playsay.gateway.dto.UserDeletionOperationResponse
import com.playsay.gateway.dto.UserManagementUser
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.UserDeletionOperationEntity
import com.playsay.gateway.utils.toApplicationRoles

fun AppUserEntity.toTeacherDirectoryEntry(): TeacherDirectoryEntry =
    TeacherDirectoryEntry(
        subject = keycloakSubject,
        displayName = displayName ?: name ?: username ?: keycloakSubject,
    )

fun AppUserEntity.toUserManagementUser(
    primaryTeacher: AppUserEntity? = null,
    activeDelegates: Collection<AppUserEntity> = emptyList(),
    lessonTranslationAllowed: Boolean = false,
): UserManagementUser =
    UserManagementUser(
        id = id,
        subject = keycloakSubject,
        username = username,
        email = email,
        displayName = displayName ?: name ?: username,
        roles = roles.toApplicationRoles(),
        status = if (deletedAt == null) "ACTIVE" else "DELETED",
        primaryTeacher = primaryTeacher?.toTeacherDirectoryEntry(),
        activeDelegates = activeDelegates.map(AppUserEntity::toTeacherDirectoryEntry),
        lessonTranslationAllowed = lessonTranslationAllowed,
    )

fun UserDeletionOperationEntity.toResponse(): UserDeletionOperationResponse =
    UserDeletionOperationResponse(
        operationId = id,
        targetSubject = targetSubject,
        status = status,
        errorCode = errorCode,
        createdAt = createdAt,
        updatedAt = updatedAt,
        completedAt = completedAt,
    )
