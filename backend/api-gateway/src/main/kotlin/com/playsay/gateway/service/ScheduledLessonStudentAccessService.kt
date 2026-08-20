package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.TeacherDelegationEntity
import com.playsay.gateway.entity.TeacherDelegationStudentEntity
import com.playsay.gateway.entity.UserManagementAuditEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.repo.TeacherDelegationStudentRepo
import com.playsay.gateway.repo.UserManagementAuditRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service

@Service
class ScheduledLessonStudentAccessService(
    private val appUserRepo: AppUserRepo,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val delegationRepo: TeacherDelegationRepo,
    private val delegationStudentRepo: TeacherDelegationStudentRepo,
    private val auditRepo: UserManagementAuditRepo,
    private val objectMapper: ObjectMapper,
    private val clock: Clock,
) {
    fun prepare(
        authentication: JwtAuthenticationToken,
        actorUserId: UUID,
        lessonTeacherUserId: UUID,
        studentUserIds: Collection<UUID>,
        scheduledEndsAt: Instant?,
        sourceId: UUID,
        auditAction: String,
    ) {
        if (studentUserIds.isEmpty()) return
        val users = appUserRepo.lockByIdIn((studentUserIds + lessonTeacherUserId).distinct())
        val teacher = users.firstOrNull { user -> user.id == lessonTeacherUserId }
            ?: fail(MetaData.ErrorCodes.USER_NOT_FOUND)
        if (!teacher.roles.hasStoredRole(MetaData.Roles.TEACHER)) return

        val students = users.filter { user -> user.id in studentUserIds }
        if (students.size != studentUserIds.distinct().size) {
            fail(MetaData.ErrorCodes.UNKNOWN_PARTICIPANT_SUBJECT)
        }

        val now = Instant.now(clock)
        val newlyAttached = mutableListOf<AppUserEntity>()
        students.filter { student -> student.managedByTeacherUserId == null }.forEach { student ->
            student.managedByTeacher = true
            student.managedByTeacherUserId = lessonTeacherUserId
            student.updatedAt = now
            newlyAttached += student
        }
        if (newlyAttached.isNotEmpty()) {
            appUserRepo.saveAllAndFlush(newlyAttached)
        }

        val foreignGroups = students
            .filter { student -> student.managedByTeacherUserId != lessonTeacherUserId }
            .groupBy { student -> requireNotNull(student.managedByTeacherUserId) }
        val sourceDelegations = delegationRepo.lockBySource(MetaData.DelegationSourceKinds.SCHEDULE, sourceId).toMutableList()

        foreignGroups.forEach { (primaryTeacherUserId, groupStudents) ->
            val primary = users.firstOrNull { user -> user.id == primaryTeacherUserId }
                ?: appUserRepo.findById(primaryTeacherUserId).orElseThrow()
            val accessEndsAt = endOfLessonDate(primary, scheduledEndsAt, now)
            val uncovered = groupStudents.filterNot { student ->
                coveringAccess(primaryTeacherUserId, lessonTeacherUserId, student.id, now, accessEndsAt, null)
            }
            if (uncovered.isEmpty()) return@forEach
            if (!authentication.isAdmin()) {
                throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.STUDENT_ACCESS_DENIED)
            }

            val delegation = sourceDelegations.firstOrNull { candidate ->
                candidate.revokedAt == null &&
                    candidate.primaryTeacherUserId == primaryTeacherUserId &&
                    candidate.delegateTeacherUserId == lessonTeacherUserId
            } ?: delegationRepo.saveAndFlush(
                TeacherDelegationEntity(
                    id = UUID.randomUUID(),
                    primaryTeacherUserId = primaryTeacherUserId,
                    delegateTeacherUserId = lessonTeacherUserId,
                    startsAt = now,
                    endsAt = accessEndsAt,
                    sourceKind = MetaData.DelegationSourceKinds.SCHEDULE,
                    sourceId = sourceId,
                    createdByUserId = actorUserId,
                    createdAt = now,
                ),
            ).also(sourceDelegations::add)

            delegation.startsAt = minOf(delegation.startsAt, now)
            delegation.endsAt = maxOf(delegation.endsAt, accessEndsAt)
            delegationRepo.saveAndFlush(delegation)
            val existingStudentIds = delegationStudentRepo.findByDelegationId(delegation.id)
                .mapTo(mutableSetOf(), TeacherDelegationStudentEntity::studentUserId)
            delegationStudentRepo.saveAllAndFlush(
                uncovered.filterNot { student -> student.id in existingStudentIds }.map { student ->
                    TeacherDelegationStudentEntity(
                        id = UUID.randomUUID(),
                        delegationId = delegation.id,
                        studentUserId = student.id,
                        createdAt = now,
                    )
                },
            )
        }

        if (newlyAttached.isNotEmpty() || foreignGroups.isNotEmpty()) {
            audit(
                actorUserId = actorUserId,
                action = auditAction,
                details = mapOf(
                    "sourceKind" to MetaData.DelegationSourceKinds.SCHEDULE,
                    "sourceId" to sourceId,
                    "lessonTeacherUserId" to lessonTeacherUserId,
                    "primaryTeacherUserIds" to foreignGroups.keys,
                    "studentUserIds" to students.map(AppUserEntity::id),
                    "attachedStudentUserIds" to newlyAttached.map(AppUserEntity::id),
                    "startsAt" to now,
                    "scheduledEndsAt" to scheduledEndsAt,
                ),
            )
        }
    }

    fun synchronize(
        sourceId: UUID,
        lessonTeacherUserId: UUID,
        actorUserId: UUID,
        allowNewScheduleDelegations: Boolean,
        auditAction: String,
    ) {
        val now = Instant.now(clock)
        val sourceDelegations = delegationRepo.lockBySource(MetaData.DelegationSourceKinds.SCHEDULE, sourceId).toMutableList()
        val lessons = lessonRepo.findByScheduleSourceId(sourceId)
            .filter { lesson -> lesson.status != MetaData.LessonStatuses.CANCELLED }
        val teacher = appUserRepo.findById(lessonTeacherUserId).orElse(null)
        if (lessons.isEmpty() || teacher?.roles.hasStoredRole(MetaData.Roles.TEACHER) != true) {
            val revoked = sourceDelegations.any { delegation -> delegation.revokedAt == null }
            revoke(sourceDelegations, actorUserId, now)
            if (revoked) {
                audit(
                    actorUserId = actorUserId,
                    action = auditAction,
                    details = mapOf(
                        "sourceKind" to MetaData.DelegationSourceKinds.SCHEDULE,
                        "sourceId" to sourceId,
                        "lessonTeacherUserId" to lessonTeacherUserId,
                        "revoked" to true,
                    ),
                )
            }
            return
        }

        val studentIds = lessonParticipantRepo.findParticipantRowsByLessonIds(lessons.map { lesson -> lesson.id })
            .mapTo(linkedSetOf()) { participant -> participant.userId }
        val users = appUserRepo.lockByIdIn(studentIds)
        val lastScheduledEnd = lessons.mapNotNull { lesson -> lesson.scheduledEnd ?: lesson.scheduledStart }.maxOrNull()
        val requiredDelegations = linkedMapOf<Pair<UUID, UUID>, RequiredScheduleDelegation>()

        users.filter { student ->
            student.managedByTeacherUserId != null && student.managedByTeacherUserId != lessonTeacherUserId
        }.groupBy { student -> requireNotNull(student.managedByTeacherUserId) }
            .forEach { (primaryTeacherUserId, students) ->
                val primary = appUserRepo.findById(primaryTeacherUserId).orElseThrow()
                val endsAt = endOfLessonDate(primary, lastScheduledEnd, now)
                val uncovered = students.filterNot { student ->
                    coveringAccess(primaryTeacherUserId, lessonTeacherUserId, student.id, now, endsAt, sourceId)
                }
                if (uncovered.isNotEmpty()) {
                    requiredDelegations[primaryTeacherUserId to lessonTeacherUserId] = RequiredScheduleDelegation(
                        primaryTeacherUserId = primaryTeacherUserId,
                        studentUserIds = uncovered.mapTo(linkedSetOf(), AppUserEntity::id),
                        endsAt = endsAt,
                    )
                }
            }

        requiredDelegations.forEach { (teachers, required) ->
            var delegation = sourceDelegations.firstOrNull { candidate ->
                candidate.revokedAt == null &&
                    candidate.primaryTeacherUserId == teachers.first &&
                    candidate.delegateTeacherUserId == teachers.second
            }
            if (delegation == null) {
                if (!allowNewScheduleDelegations) {
                    throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.STUDENT_ACCESS_DENIED)
                }
                delegation = delegationRepo.saveAndFlush(
                    TeacherDelegationEntity(
                        id = UUID.randomUUID(),
                        primaryTeacherUserId = required.primaryTeacherUserId,
                        delegateTeacherUserId = lessonTeacherUserId,
                        startsAt = now,
                        endsAt = required.endsAt,
                        sourceKind = MetaData.DelegationSourceKinds.SCHEDULE,
                        sourceId = sourceId,
                        createdByUserId = actorUserId,
                        createdAt = now,
                    ),
                )
                sourceDelegations += delegation
            }
            delegation.startsAt = minOf(delegation.startsAt, now)
            delegation.endsAt = required.endsAt
            delegation.revokedAt = null
            delegation.revokedByUserId = null
            delegationRepo.saveAndFlush(delegation)
            delegationStudentRepo.deleteByDelegationId(delegation.id)
            delegationStudentRepo.flush()
            delegationStudentRepo.saveAllAndFlush(
                required.studentUserIds.map { studentUserId ->
                    TeacherDelegationStudentEntity(
                        id = UUID.randomUUID(),
                        delegationId = delegation.id,
                        studentUserId = studentUserId,
                        createdAt = now,
                    )
                },
            )
        }

        val requiredKeys = requiredDelegations.keys
        revoke(
            sourceDelegations.filter { delegation ->
                delegation.revokedAt == null &&
                    (delegation.primaryTeacherUserId to delegation.delegateTeacherUserId) !in requiredKeys
            },
            actorUserId,
            now,
        )
        if (requiredDelegations.isNotEmpty() || sourceDelegations.isNotEmpty()) {
            audit(
                actorUserId = actorUserId,
                action = auditAction,
                details = mapOf(
                    "sourceKind" to MetaData.DelegationSourceKinds.SCHEDULE,
                    "sourceId" to sourceId,
                    "lessonTeacherUserId" to lessonTeacherUserId,
                    "primaryTeacherUserIds" to requiredDelegations.values.map(RequiredScheduleDelegation::primaryTeacherUserId),
                    "studentUserIds" to studentIds,
                    "startsAt" to now,
                    "endsAt" to requiredDelegations.values.map(RequiredScheduleDelegation::endsAt),
                ),
            )
        }
    }

    private fun coveringAccess(
        primaryTeacherUserId: UUID,
        delegateTeacherUserId: UUID,
        studentUserId: UUID,
        startsAt: Instant,
        endsAt: Instant,
        excludedSourceId: UUID?,
    ): Boolean = delegationRepo.findCoveringAccess(
        primaryTeacherUserId = primaryTeacherUserId,
        delegateTeacherUserId = delegateTeacherUserId,
        studentUserId = studentUserId,
        startsAt = startsAt,
        endsAt = endsAt,
    ).any { delegation ->
        excludedSourceId == null ||
            delegation.sourceKind != MetaData.DelegationSourceKinds.SCHEDULE ||
            delegation.sourceId != excludedSourceId
    }

    private fun endOfLessonDate(primaryTeacher: AppUserEntity, scheduledEnd: Instant?, now: Instant): Instant {
        val zone = runCatching { ZoneId.of(primaryTeacher.timezone ?: DEFAULT_TIMEZONE) }
            .getOrElse { ZoneId.of(DEFAULT_TIMEZONE) }
        val lessonDateEnd = (scheduledEnd ?: now).atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant()
        return maxOf(lessonDateEnd, now.plusSeconds(1))
    }

    private fun revoke(delegations: Collection<TeacherDelegationEntity>, actorUserId: UUID, now: Instant) {
        delegations.filter { delegation -> delegation.revokedAt == null }.forEach { delegation ->
            delegation.revokedAt = now
            delegation.revokedByUserId = actorUserId
            delegationRepo.save(delegation)
        }
        delegationRepo.flush()
    }

    private fun audit(actorUserId: UUID, action: String, details: Map<String, Any?>) {
        auditRepo.save(
            UserManagementAuditEntity(
                id = UUID.randomUUID(),
                actorUserId = actorUserId,
                action = action,
                details = objectMapper.writeValueAsString(details),
                createdAt = Instant.now(clock),
            ),
        )
    }

    private fun JwtAuthenticationToken.isAdmin(): Boolean =
        authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }

    private fun String?.hasStoredRole(role: String): Boolean =
        this?.split(',')?.any { storedRole -> storedRole.trim() == role } == true

    private fun fail(code: String): Nothing =
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, code)

    private data class RequiredScheduleDelegation(
        val primaryTeacherUserId: UUID,
        val studentUserIds: Set<UUID>,
        val endsAt: Instant,
    )

    private companion object {
        const val DEFAULT_TIMEZONE = "Europe/Moscow"
    }
}
