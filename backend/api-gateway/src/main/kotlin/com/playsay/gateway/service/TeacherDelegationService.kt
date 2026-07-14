package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.dto.AttachStudentRequest
import com.playsay.gateway.dto.CreateDelegationRequest
import com.playsay.gateway.dto.TeacherDelegationResponse
import com.playsay.gateway.dto.TeacherDirectoryEntry
import com.playsay.gateway.dto.TeacherStudentResponse
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.TeacherDelegationEntity
import com.playsay.gateway.entity.TeacherDelegationStudentEntity
import com.playsay.gateway.entity.UserManagementAuditEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.mapper.toTeacherDirectoryEntry
import com.playsay.gateway.mapper.toUserManagementUser
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.repo.TeacherDelegationStudentRepo
import com.playsay.gateway.repo.UserManagementAuditRepo
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.utils.hasApplicationRole
import com.playsay.gateway.utils.toStoredRoles
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class TeacherDelegationService(
    private val appUserRepo: AppUserRepo,
    private val delegationRepo: TeacherDelegationRepo,
    private val delegationStudentRepo: TeacherDelegationStudentRepo,
    private val auditRepo: UserManagementAuditRepo,
    private val userProfileStore: UserProfileStore,
    private val registrationGateway: RegistrationGateway,
    private val objectMapper: ObjectMapper,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    fun teacherDirectory(authentication: JwtAuthenticationToken): List<TeacherDirectoryEntry> {
        requireTeacherOrAdmin(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        return appUserRepo.findByRoleOrdered(MetaData.Roles.TEACHER)
            .filter { teacher -> authentication.isAdmin() || teacher.id != actorId }
            .map(AppUserEntity::toTeacherDirectoryEntry)
    }

    @Transactional(readOnly = true)
    fun listTeacherStudents(authentication: JwtAuthenticationToken): List<TeacherStudentResponse> {
        requireTeacherOrAdmin(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        if (authentication.isAdmin()) {
            return appUserRepo.findByRoleOrdered(MetaData.Roles.STUDENT)
                .map { student -> TeacherStudentResponse(studentView(student), StudentAccessDecision.ADMIN.name) }
        }
        val primary = appUserRepo.findByManagedByTeacherUserIdOrderByDisplayNameAscUsernameAsc(actorId)
        val primaryIds = primary.mapTo(mutableSetOf(), AppUserEntity::id)
        val delegated = appUserRepo.findByIdIn(delegationRepo.findActiveStudentIds(actorId, Instant.now(clock)))
            .filterNot { it.id in primaryIds }
        return primary.map { student -> TeacherStudentResponse(studentView(student), StudentAccessDecision.PRIMARY_TEACHER.name) } +
            delegated.map { student -> TeacherStudentResponse(studentView(student), StudentAccessDecision.ACTIVE_DELEGATE.name) }
    }

    @Transactional
    fun attachStudent(authentication: JwtAuthenticationToken, request: AttachStudentRequest): TeacherStudentResponse {
        requireTeacher(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        val identifier = request.usernameOrEmail.trim()
        val localStudent = if ('@' in identifier) {
            appUserRepo.findByEmailIgnoreCase(identifier)
        } else {
            appUserRepo.findByUsernameIgnoreCase(identifier)
        }
        val student = localStudent ?: registrationGateway.findExactUser(identifier)
            ?.takeIf { identity -> MetaData.Roles.STUDENT in identity.roles }
            ?.let { identity ->
                val now = Instant.now(clock)
                appUserRepo.saveAndFlush(
                    AppUserEntity(
                        id = UUID.randomUUID(),
                        keycloakSubject = identity.subject,
                        username = identity.username,
                        email = identity.email,
                        name = identity.displayName,
                        roles = identity.roles.toStoredRoles(),
                        displayName = identity.displayName,
                        createdAt = now,
                        updatedAt = now,
                    ),
                )
            } ?: notFound()
        requireStudent(student)
        if (student.managedByTeacherUserId != null && student.managedByTeacherUserId != actorId) {
            fail(HttpStatus.CONFLICT, MetaData.ErrorCodes.STUDENT_ALREADY_ASSIGNED)
        }
        student.managedByTeacher = true
        student.managedByTeacherUserId = actorId
        student.updatedAt = Instant.now(clock)
        appUserRepo.saveAndFlush(student)
        audit(actorId, "STUDENT_ATTACHED", student.keycloakSubject, mapOf("primaryTeacherUserId" to actorId))
        return TeacherStudentResponse(studentView(student), StudentAccessDecision.PRIMARY_TEACHER.name)
    }

    @Transactional
    fun detachStudent(authentication: JwtAuthenticationToken, studentSubject: String) {
        requireTeacher(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        val student = user(studentSubject)
        if (student.managedByTeacherUserId != actorId) {
            fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.STUDENT_ACCESS_DENIED)
        }
        clearPrimaryTeacher(student, actorId)
    }

    @Transactional
    fun assignPrimaryTeacher(
        authentication: JwtAuthenticationToken,
        studentSubject: String,
        teacherSubject: String,
    ): TeacherStudentResponse {
        requireAdmin(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        val student = user(studentSubject).also(::requireStudent)
        val teacher = user(teacherSubject).also(::requireTeacherUser)
        if (student.managedByTeacherUserId != teacher.id) {
            delegationRepo.revokeForStudent(student.id, actorId, Instant.now(clock))
        }
        student.managedByTeacher = true
        student.managedByTeacherUserId = teacher.id
        student.updatedAt = Instant.now(clock)
        appUserRepo.saveAndFlush(student)
        audit(actorId, "PRIMARY_TEACHER_ASSIGNED", studentSubject, mapOf("primaryTeacherSubject" to teacherSubject))
        return TeacherStudentResponse(studentView(student), StudentAccessDecision.ADMIN.name)
    }

    @Transactional
    fun removePrimaryTeacher(authentication: JwtAuthenticationToken, studentSubject: String) {
        requireAdmin(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        clearPrimaryTeacher(user(studentSubject).also(::requireStudent), actorId)
    }

    @Transactional
    fun create(authentication: JwtAuthenticationToken, request: CreateDelegationRequest): List<TeacherDelegationResponse> {
        requireTeacherOrAdmin(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        val primary = resolvePrimaryTeacher(authentication, actorId, request.primaryTeacherSubject)
        val delegates = request.delegateTeacherSubjects.map(::user)
        delegates.forEach {
            requireTeacherUser(it)
            if (it.id == primary.id) fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.DELEGATION_TEACHER_INVALID)
        }
        val students = request.studentSubjects.map(::user)
        students.forEach {
            requireStudent(it)
            if (it.managedByTeacherUserId != primary.id) {
                fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.DELEGATION_STUDENT_INVALID)
            }
        }
        val (startsAt, endsAt) = delegationPeriod(primary, request)
        val now = Instant.now(clock)
        val saved = delegates.map { delegate ->
            val delegation = delegationRepo.saveAndFlush(
                TeacherDelegationEntity(
                    id = UUID.randomUUID(),
                    primaryTeacherUserId = primary.id,
                    delegateTeacherUserId = delegate.id,
                    startsAt = startsAt,
                    endsAt = endsAt,
                    createdByUserId = actorId,
                    createdAt = now,
                ),
            )
            delegationStudentRepo.saveAllAndFlush(
                students.map { student ->
                    TeacherDelegationStudentEntity(
                        id = UUID.randomUUID(),
                        delegationId = delegation.id,
                        studentUserId = student.id,
                        createdAt = now,
                    )
                },
            )
            delegation
        }
        audit(
            actorId,
            "DELEGATION_CREATED",
            primary.keycloakSubject,
            mapOf(
                "primaryTeacherSubject" to primary.keycloakSubject,
                "delegateTeacherSubjects" to delegates.map(AppUserEntity::keycloakSubject),
                "studentSubjects" to students.map(AppUserEntity::keycloakSubject),
                "startsAt" to startsAt,
                "endsAt" to endsAt,
            ),
        )
        return saved.map { delegation -> delegationResponse(delegation) }
    }

    @Transactional(readOnly = true)
    fun listTeacher(
        authentication: JwtAuthenticationToken,
        direction: String,
        status: String?,
    ): List<TeacherDelegationResponse> {
        requireTeacherOrAdmin(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        val rows = when (direction.lowercase()) {
            "granted" -> delegationRepo.findByPrimaryTeacherUserIdOrderByCreatedAtDesc(actorId)
            "received" -> delegationRepo.findByDelegateTeacherUserIdOrderByCreatedAtDesc(actorId)
            else -> fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.INVALID_REQUEST)
        }
        return rows.filter { status == null || delegationStatus(it).equals(status, ignoreCase = true) }
            .map(::delegationResponse)
    }

    @Transactional(readOnly = true)
    fun listAdmin(authentication: JwtAuthenticationToken, status: String?): List<TeacherDelegationResponse> {
        requireAdmin(authentication)
        return delegationRepo.findAllByOrderByCreatedAtDesc()
            .filter { status == null || delegationStatus(it).equals(status, ignoreCase = true) }
            .map(::delegationResponse)
    }

    @Transactional
    fun revoke(authentication: JwtAuthenticationToken, delegationId: UUID) {
        requireTeacherOrAdmin(authentication)
        val actorId = userProfileStore.currentUserId(authentication)
        val delegation = delegationRepo.findById(delegationId).orElse(null)
            ?: fail(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.DELEGATION_NOT_FOUND)
        if (!authentication.isAdmin() && delegation.primaryTeacherUserId != actorId) {
            fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.STUDENT_ACCESS_DENIED)
        }
        if (delegation.revokedAt == null) {
            delegation.revokedAt = Instant.now(clock)
            delegation.revokedByUserId = actorId
            delegationRepo.saveAndFlush(delegation)
            audit(actorId, "DELEGATION_REVOKED", null, mapOf("delegationId" to delegationId))
        }
    }

    private fun resolvePrimaryTeacher(
        authentication: JwtAuthenticationToken,
        actorId: UUID,
        requestedSubject: String?,
    ): AppUserEntity {
        if (authentication.isAdmin()) {
            return requestedSubject?.let(::user)?.also(::requireTeacherUser)
                ?: appUserRepo.findById(actorId).orElseThrow()
                    .also(::requireTeacherUser)
        }
        val actor = appUserRepo.findById(actorId).orElseThrow().also(::requireTeacherUser)
        if (requestedSubject != null && requestedSubject != actor.keycloakSubject) {
            fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.DELEGATION_TEACHER_INVALID)
        }
        return actor
    }

    private fun delegationPeriod(primary: AppUserEntity, request: CreateDelegationRequest): Pair<Instant, Instant> {
        if (request.endsAt.isBefore(request.startsAt)) {
            fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.DELEGATION_PERIOD_INVALID)
        }
        val zone = runCatching { ZoneId.of(primary.timezone ?: defaultTimezone) }.getOrElse { ZoneId.of(defaultTimezone) }
        return request.startsAt.atStartOfDay(zone).toInstant() to request.endsAt.plusDays(1).atStartOfDay(zone).toInstant()
    }

    private fun delegationResponse(delegation: TeacherDelegationEntity): TeacherDelegationResponse {
        val primary = appUserRepo.findById(delegation.primaryTeacherUserId).orElseThrow()
        val delegate = appUserRepo.findById(delegation.delegateTeacherUserId).orElseThrow()
        val creator = appUserRepo.findById(delegation.createdByUserId).orElseThrow()
        val studentIds = delegationStudentRepo.findByDelegationId(delegation.id).map { it.studentUserId }
        return TeacherDelegationResponse(
            id = delegation.id,
            primaryTeacher = primary.toTeacherDirectoryEntry(),
            delegateTeacher = delegate.toTeacherDirectoryEntry(),
            students = appUserRepo.findByIdIn(studentIds).map(::studentView),
            startsAt = delegation.startsAt,
            endsAt = delegation.endsAt,
            status = delegationStatus(delegation),
            createdBySubject = creator.keycloakSubject,
            createdAt = delegation.createdAt,
            revokedAt = delegation.revokedAt,
        )
    }

    private fun studentView(student: AppUserEntity) =
        student.toUserManagementUser(
            primaryTeacher = student.managedByTeacherUserId?.let { appUserRepo.findById(it).orElse(null) },
            activeDelegates = delegationRepo.findActiveForStudent(student.id, Instant.now(clock))
                .mapNotNull { appUserRepo.findById(it.delegateTeacherUserId).orElse(null) },
        )

    private fun delegationStatus(delegation: TeacherDelegationEntity): String {
        val now = Instant.now(clock)
        return when {
            delegation.revokedAt != null -> "REVOKED"
            now.isBefore(delegation.startsAt) -> "FUTURE"
            !now.isBefore(delegation.endsAt) -> "EXPIRED"
            else -> "ACTIVE"
        }
    }

    private fun clearPrimaryTeacher(student: AppUserEntity, actorId: UUID) {
        delegationRepo.revokeForStudent(student.id, actorId, Instant.now(clock))
        student.managedByTeacher = false
        student.managedByTeacherUserId = null
        student.updatedAt = Instant.now(clock)
        appUserRepo.saveAndFlush(student)
        audit(actorId, "PRIMARY_TEACHER_REMOVED", student.keycloakSubject, emptyMap())
    }

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

    private fun user(subject: String): AppUserEntity =
        appUserRepo.findByKeycloakSubject(subject)?.takeIf { it.deletedAt == null } ?: notFound()

    private fun requireStudent(user: AppUserEntity) {
        if (!user.roles.hasApplicationRole(MetaData.Roles.STUDENT)) fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.DELEGATION_STUDENT_INVALID)
    }

    private fun requireTeacherUser(user: AppUserEntity) {
        if (!user.roles.hasApplicationRole(MetaData.Roles.TEACHER)) fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.DELEGATION_TEACHER_INVALID)
    }

    private fun requireTeacher(authentication: JwtAuthenticationToken) {
        if (authentication.authorities.none { it.authority == MetaData.Authorities.TEACHER }) {
            fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
        }
    }

    private fun requireTeacherOrAdmin(authentication: JwtAuthenticationToken) {
        if (authentication.authorities.none { it.authority == MetaData.Authorities.TEACHER || it.authority == MetaData.Authorities.ADMIN }) {
            fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
        }
    }

    private fun requireAdmin(authentication: JwtAuthenticationToken) {
        if (!authentication.isAdmin()) fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.ADMIN_ROLE_REQUIRED)
    }

    private fun JwtAuthenticationToken.isAdmin(): Boolean =
        authorities.any { it.authority == MetaData.Authorities.ADMIN }

    private fun notFound(): Nothing = fail(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.USER_NOT_FOUND)

    private fun fail(status: HttpStatus, code: String): Nothing =
        throw ProjectResponseException.localized(status, code)

    private companion object {
        const val defaultTimezone = "Europe/Moscow"
    }
}
