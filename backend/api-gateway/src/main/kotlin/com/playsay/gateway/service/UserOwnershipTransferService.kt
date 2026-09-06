package com.playsay.gateway.service

import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.CourseRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class UserOwnershipTransferService(
    private val appUserRepo: AppUserRepo,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val assignmentRepo: AssignmentRepo,
    private val materialRepo: LessonMaterialRepo,
    private val courseRepo: CourseRepo,
    private val delegationRepo: TeacherDelegationRepo,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    fun hasTeacherDependencies(teacherUserId: UUID): Boolean =
        appUserRepo.findByManagedByTeacherUserIdOrderByDisplayNameAscUsernameAsc(teacherUserId).isNotEmpty() ||
            lessonRepo.findByTeacherUserId(teacherUserId).any { it.status == MetaData.LessonStatuses.SCHEDULED } ||
            assignmentRepo.findByTeacherUserId(teacherUserId).any { it.status == MetaData.AssignmentStatuses.ACTIVE } ||
            materialRepo.findByOwnerTeacherUserId(teacherUserId).isNotEmpty() ||
            courseRepo.findByCreatedByUserId(teacherUserId).isNotEmpty()

    @Transactional(readOnly = true)
    fun hasInProgressLesson(userId: UUID): Boolean =
        lessonRepo.countByTeacherUserIdAndStatus(userId, MetaData.LessonStatuses.IN_PROGRESS) > 0 ||
            lessonParticipantRepo.findByStudentUserId(userId).any {
                lessonRepo.findById(it.lessonId).orElse(null)?.status == MetaData.LessonStatuses.IN_PROGRESS
            }

    @Transactional
    fun lockUserLessons(userId: UUID) { lessonRepo.lockForUser(userId) }

    @Transactional
    fun transferTeacherOwnership(fromTeacherUserId: UUID, toTeacherUserId: UUID, actorUserId: UUID) {
        val now = Instant.now(clock)
        appUserRepo.findByManagedByTeacherUserIdOrderByDisplayNameAscUsernameAsc(fromTeacherUserId).forEach { student ->
            student.managedByTeacher = true
            student.managedByTeacherUserId = toTeacherUserId
            student.updatedAt = now
        }
        lessonRepo.findByTeacherUserId(fromTeacherUserId)
            .filter { it.status == MetaData.LessonStatuses.SCHEDULED }
            .forEach { lesson -> lesson.teacherUserId = toTeacherUserId; lesson.updatedAt = now }
        assignmentRepo.findByTeacherUserId(fromTeacherUserId)
            .filter { it.status == MetaData.AssignmentStatuses.ACTIVE }
            .forEach { assignment -> assignment.teacherUserId = toTeacherUserId; assignment.updatedAt = now }
        materialRepo.findByOwnerTeacherUserId(fromTeacherUserId)
            .forEach { material -> material.ownerTeacherUserId = toTeacherUserId; material.updatedAt = now }
        courseRepo.findByCreatedByUserId(fromTeacherUserId)
            .forEach { course -> course.createdByUserId = toTeacherUserId; course.updatedAt = now }
        delegationRepo.revokeForTeacher(fromTeacherUserId, actorUserId, now)
    }

    @Transactional
    fun revokeTeacherDelegations(teacherUserId: UUID, actorUserId: UUID) {
        delegationRepo.revokeForTeacher(teacherUserId, actorUserId, Instant.now(clock))
    }


}
