package com.playsay.gateway.service

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

enum class StudentAccessDecision {
    PRIMARY_TEACHER,
    ACTIVE_DELEGATE,
    ADMIN,
    DENIED,
}

@Component
class StudentAccessPolicy(
    private val appUserRepo: AppUserRepo,
    private val delegationRepo: TeacherDelegationRepo,
    private val userProfileStore: UserProfileStore,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    fun evaluate(authentication: JwtAuthenticationToken, studentSubject: String): StudentAccessDecision {
        if (authentication.authorities.any { it.authority == MetaData.Authorities.ADMIN }) {
            return StudentAccessDecision.ADMIN
        }
        val actorUserId = userProfileStore.currentUserId(authentication)
        val student = appUserRepo.findByKeycloakSubject(studentSubject) ?: return StudentAccessDecision.DENIED
        return evaluate(actorUserId, student, Instant.now(clock))
    }

    @Transactional(readOnly = true)
    fun evaluate(actorUserId: UUID, studentUserId: UUID): StudentAccessDecision =
        evaluate(actorUserId, studentUserId, Instant.now(clock))

    @Transactional(readOnly = true)
    fun evaluate(actorUserId: UUID, studentUserId: UUID, at: Instant): StudentAccessDecision {
        val student = appUserRepo.findById(studentUserId).orElse(null) ?: return StudentAccessDecision.DENIED
        return evaluate(actorUserId, student, at)
    }

    @Transactional(readOnly = true)
    fun canAccessEveryStudent(actorUserId: UUID, studentUserIds: Collection<UUID>): Boolean =
        canAccessEveryStudent(actorUserId, studentUserIds, Instant.now(clock))

    @Transactional(readOnly = true)
    fun canAccessEveryStudent(actorUserId: UUID, studentUserIds: Collection<UUID>, at: Instant): Boolean =
        studentUserIds.isNotEmpty() && studentUserIds.all { studentUserId ->
            evaluate(actorUserId, studentUserId, at) != StudentAccessDecision.DENIED
        }

    private fun evaluate(actorUserId: UUID, student: AppUserEntity, at: Instant): StudentAccessDecision =
        when {
            student.deletedAt != null -> StudentAccessDecision.DENIED
            student.managedByTeacherUserId == actorUserId -> StudentAccessDecision.PRIMARY_TEACHER
            delegationRepo.findActiveAccess(actorUserId, student.id, at).isNotEmpty() -> StudentAccessDecision.ACTIVE_DELEGATE
            else -> StudentAccessDecision.DENIED
        }
}
