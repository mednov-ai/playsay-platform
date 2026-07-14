package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.dto.CreateUserManagementUserRequest
import com.playsay.gateway.dto.RegistrationCreateUserRequest
import com.playsay.gateway.dto.RegistrationRolesRequest
import com.playsay.gateway.dto.UpdateUserRolesRequest
import com.playsay.gateway.dto.UserDeletionOperationResponse
import com.playsay.gateway.dto.UserManagementUser
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.UserDeletionOperationEntity
import com.playsay.gateway.entity.UserManagementAuditEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.mapper.toResponse
import com.playsay.gateway.mapper.toUserManagementUser
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.repo.UserDeletionOperationRepo
import com.playsay.gateway.repo.UserManagementAuditRepo
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.utils.hasApplicationRole
import com.playsay.gateway.utils.toApplicationRoles
import com.playsay.gateway.utils.toStoredRoles
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class UserDeletionRequestedEvent(val operationId: UUID)

@Service
class UserManagementService(
    private val appUserRepo: AppUserRepo,
    private val delegationRepo: TeacherDelegationRepo,
    private val operationRepo: UserDeletionOperationRepo,
    private val auditRepo: UserManagementAuditRepo,
    private val registrationGateway: RegistrationGateway,
    private val userProfileStore: UserProfileStore,
    private val ownershipService: UserOwnershipTransferService,
    private val eventPublisher: ApplicationEventPublisher,
    private val objectMapper: ObjectMapper,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    fun list(
        authentication: JwtAuthenticationToken,
        query: String?,
        role: String?,
        status: String?,
    ): List<UserManagementUser> {
        requireAdmin(authentication)
        val normalizedQuery = query?.trim()?.lowercase()?.takeIf(String::isNotEmpty)
        return appUserRepo.findAll()
            .asSequence()
            .filter { user -> status == null || user.status().equals(status, ignoreCase = true) }
            .filter { user -> role == null || user.roles.hasApplicationRole(role.uppercase()) }
            .filter { user ->
                normalizedQuery == null || listOf(user.username, user.email, user.displayName, user.name, user.keycloakSubject)
                    .filterNotNull().any { value -> normalizedQuery in value.lowercase() }
            }
            .sortedBy { user -> user.displayName ?: user.username ?: user.keycloakSubject }
            .map(::view)
            .toList()
    }

    @Transactional
    fun create(
        authentication: JwtAuthenticationToken,
        request: CreateUserManagementUserRequest,
    ): UserManagementUser {
        requireAdmin(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        val roles = validatedRoles(request.roles)
        val primaryTeacher = request.primaryTeacherSubject?.let(::activeUser)?.also(::requireTeacherUser)
        if (MetaData.Roles.STUDENT !in roles && primaryTeacher != null) invalidRoles()
        val identity = registrationGateway.createUser(
            RegistrationCreateUserRequest(
                username = request.username,
                firstName = request.firstName,
                lastName = request.lastName,
                email = request.email,
                roles = roles,
                managedStudent = MetaData.Roles.STUDENT in roles,
            ),
        )
        val now = Instant.now(clock)
        val user = appUserRepo.saveAndFlush(
            AppUserEntity(
                id = UUID.randomUUID(),
                keycloakSubject = identity.subject,
                username = identity.username,
                email = identity.email,
                name = identity.displayName,
                roles = roles.toStoredRoles(),
                displayName = identity.displayName ?: listOfNotNull(request.firstName, request.lastName).joinToString(" "),
                countryCode = "RU",
                managedByTeacher = primaryTeacher != null,
                managedByTeacherUserId = primaryTeacher?.id,
                createdAt = now,
                updatedAt = now,
            ),
        )
        audit(
            actorId,
            "USER_CREATED",
            user.keycloakSubject,
            mapOf("roles" to roles, "primaryTeacherSubject" to primaryTeacher?.keycloakSubject),
        )
        return view(user)
    }

    @Transactional
    fun updateRoles(
        authentication: JwtAuthenticationToken,
        subject: String,
        request: UpdateUserRolesRequest,
    ): UserManagementUser {
        requireAdmin(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        val target = activeUser(subject)
        val previousRoles = target.roles.toApplicationRoles().toSet()
        val roles = validatedRoles(request.roles)
        if (target.id == actorId && MetaData.Roles.ADMIN in previousRoles && MetaData.Roles.ADMIN !in roles) {
            fail(HttpStatus.CONFLICT, MetaData.ErrorCodes.USER_SELF_ADMIN_CHANGE_FORBIDDEN)
        }
        if (MetaData.Roles.ADMIN in previousRoles && MetaData.Roles.ADMIN !in roles &&
            appUserRepo.countByRolesContainingAndDeletedAtIsNull(MetaData.Roles.ADMIN) <= 1
        ) {
            fail(HttpStatus.CONFLICT, MetaData.ErrorCodes.LAST_ADMIN_REQUIRED)
        }
        if (MetaData.Roles.TEACHER in previousRoles && MetaData.Roles.TEACHER !in roles) {
            removeTeacherRole(target, request.replacementTeacherSubject, actorId)
        }
        registrationGateway.updateRoles(subject, RegistrationRolesRequest(roles))
        target.roles = roles.toStoredRoles()
        target.rolesChangedAt = Instant.now(clock)
        target.updatedAt = target.rolesChangedAt!!
        appUserRepo.saveAndFlush(target)
        audit(actorId, "USER_ROLES_CHANGED", subject, mapOf("before" to previousRoles, "after" to roles))
        return view(target)
    }

    @Transactional
    fun requestDeletion(
        authentication: JwtAuthenticationToken,
        subject: String,
        replacementTeacherSubject: String?,
    ): UserDeletionOperationResponse {
        requireAdmin(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        operationRepo.findFirstByTargetSubjectOrderByCreatedAtDesc(subject)?.let { existing ->
            if (existing.status in idempotentStatuses) return existing.toResponse()
        }
        val target = appUserRepo.findByKeycloakSubject(subject) ?: notFound()
        if (target.id == actorId && target.roles.hasApplicationRole(MetaData.Roles.ADMIN)) {
            fail(HttpStatus.CONFLICT, MetaData.ErrorCodes.USER_SELF_ADMIN_CHANGE_FORBIDDEN)
        }
        if (target.roles.hasApplicationRole(MetaData.Roles.ADMIN) &&
            appUserRepo.countByRolesContainingAndDeletedAtIsNull(MetaData.Roles.ADMIN) <= 1
        ) {
            fail(HttpStatus.CONFLICT, MetaData.ErrorCodes.LAST_ADMIN_REQUIRED)
        }
        val replacement = if (target.roles.hasApplicationRole(MetaData.Roles.TEACHER)) {
            validateTeacherRemoval(target, replacementTeacherSubject)
        } else {
            null
        }
        val now = Instant.now(clock)
        val operation = operationRepo.saveAndFlush(
            UserDeletionOperationEntity(
                id = UUID.randomUUID(),
                targetUserId = target.id,
                targetSubject = target.keycloakSubject,
                requestedByUserId = actorId,
                replacementTeacherUserId = replacement?.id,
                status = "PENDING",
                createdAt = now,
                updatedAt = now,
            ),
        )
        audit(actorId, "USER_DELETE_REQUESTED", subject, mapOf("replacementTeacherSubject" to replacement?.keycloakSubject))
        eventPublisher.publishEvent(UserDeletionRequestedEvent(operation.id))
        return operation.toResponse()
    }

    @Transactional(readOnly = true)
    fun operation(authentication: JwtAuthenticationToken, operationId: UUID): UserDeletionOperationResponse {
        requireAdmin(authentication)
        return operationRepo.findById(operationId).orElse(null)?.toResponse() ?: notFound()
    }

    private fun removeTeacherRole(target: AppUserEntity, replacementSubject: String?, actorId: UUID) {
        val replacement = validateTeacherRemoval(target, replacementSubject)
        if (replacement != null) {
            ownershipService.transferTeacherOwnership(target.id, replacement.id, actorId)
        } else {
            ownershipService.revokeTeacherDelegations(target.id, actorId)
        }
    }

    private fun validateTeacherRemoval(target: AppUserEntity, replacementSubject: String?): AppUserEntity? {
        if (ownershipService.hasInProgressLesson(target.id)) {
            fail(HttpStatus.CONFLICT, MetaData.ErrorCodes.USER_DELETE_IN_PROGRESS_LESSON)
        }
        if (!ownershipService.hasTeacherDependencies(target.id)) return null
        val replacement = replacementSubject?.let(::activeUser)
            ?: fail(HttpStatus.CONFLICT, MetaData.ErrorCodes.USER_DELETE_REPLACEMENT_REQUIRED)
        requireTeacherUser(replacement)
        if (replacement.id == target.id) fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.DELEGATION_TEACHER_INVALID)
        return replacement
    }

    private fun view(user: AppUserEntity): UserManagementUser {
        val primary = user.managedByTeacherUserId?.let { appUserRepo.findById(it).orElse(null) }
        val delegates = delegationRepo.findActiveForStudent(user.id, Instant.now(clock))
            .mapNotNull { delegation -> appUserRepo.findById(delegation.delegateTeacherUserId).orElse(null) }
        return user.toUserManagementUser(primary, delegates)
    }

    private fun validatedRoles(requested: Set<String>): Set<String> {
        val roles = requested.mapTo(linkedSetOf(), String::uppercase)
        if (roles.isEmpty() || roles.any { it !in applicationRoles } ||
            (MetaData.Roles.STUDENT in roles && roles.size != 1)
        ) invalidRoles()
        return roles
    }

    private fun requireTeacherUser(user: AppUserEntity) {
        if (!user.roles.hasApplicationRole(MetaData.Roles.TEACHER)) {
            fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.DELEGATION_TEACHER_INVALID)
        }
    }

    private fun activeUser(subject: String): AppUserEntity =
        appUserRepo.findByKeycloakSubject(subject)?.takeIf { it.deletedAt == null } ?: notFound()

    private fun AppUserEntity.status(): String = if (deletedAt == null) "ACTIVE" else "DELETED"

    private fun audit(actorId: UUID, action: String, targetSubject: String?, details: Map<String, Any?>) {
        auditRepo.save(
            UserManagementAuditEntity(
                id = UUID.randomUUID(),
                actorUserId = actorId,
                action = action,
                targetSubject = targetSubject,
                details = objectMapper.writeValueAsString(details),
                createdAt = Instant.now(clock),
            ),
        )
    }

    private fun requireAdmin(authentication: JwtAuthenticationToken) {
        if (authentication.authorities.none { it.authority == MetaData.Authorities.ADMIN }) {
            fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.ADMIN_ROLE_REQUIRED)
        }
    }

    private fun invalidRoles(): Nothing = fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.USER_ROLE_COMBINATION_INVALID)
    private fun notFound(): Nothing = fail(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.USER_NOT_FOUND)
    private fun fail(status: HttpStatus, code: String): Nothing = throw ProjectResponseException.localized(status, code)

    private companion object {
        val applicationRoles = setOf(MetaData.Roles.STUDENT, MetaData.Roles.TEACHER, MetaData.Roles.ADMIN)
        val idempotentStatuses = setOf("PENDING", "RUNNING", "COMPLETED")
    }
}
