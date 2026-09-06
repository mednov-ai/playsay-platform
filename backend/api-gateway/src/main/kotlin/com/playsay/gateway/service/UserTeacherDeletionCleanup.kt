package com.playsay.gateway.service

import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.CourseRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class UserTeacherDeletionCleanup(
    private val appUserRepo: AppUserRepo,
    private val lessonRepo: LessonRepo,
    private val assignmentRepo: AssignmentRepo,
    private val materialRepo: LessonMaterialRepo,
    private val courseRepo: CourseRepo,
    private val lessonReminderService: LessonReminderService,
    private val clock: Clock,
) {
    @Transactional
    fun detachDeletedTeacher(teacherUserId: UUID) {
        val now = Instant.now(clock)
        appUserRepo.findByManagedByTeacherUserIdOrderByDisplayNameAscUsernameAsc(teacherUserId).forEach { student ->
            student.managedByTeacherUserId = null
            student.managedByTeacher = false
            student.updatedAt = now
        }
        lessonRepo.findByTeacherUserId(teacherUserId)
            .filter { it.status == MetaData.LessonStatuses.SCHEDULED }
            .forEach { lesson ->
                lesson.status = MetaData.LessonStatuses.CANCELLED
                lesson.updatedAt = now
                lessonReminderService.cancelPendingReminders(lesson.id)
            }
        assignmentRepo.findByTeacherUserId(teacherUserId).forEach { assignment ->
            assignment.teacherUserId = null
            assignment.updatedAt = now
        }
        materialRepo.findByOwnerTeacherUserId(teacherUserId).forEach { material ->
            material.ownerTeacherUserId = null
            material.updatedAt = now
        }
        courseRepo.findByCreatedByUserId(teacherUserId).forEach { course ->
            course.createdByUserId = null
            course.updatedAt = now
        }
    }

}
