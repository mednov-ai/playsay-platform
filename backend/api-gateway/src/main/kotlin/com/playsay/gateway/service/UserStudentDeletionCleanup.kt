package com.playsay.gateway.service

import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.TeacherDelegationStudentRepo
import com.playsay.gateway.repo.StudentProfileRepo
import com.playsay.gateway.repo.TeacherProfileRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class UserStudentDeletionCleanup(
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val lessonRepo: LessonRepo,
    private val delegationStudentRepo: TeacherDelegationStudentRepo,
    private val studentProfileRepo: StudentProfileRepo,
    private val teacherProfileRepo: TeacherProfileRepo,
    private val clock: Clock,
) {
    @Transactional
    fun removeFutureStudentAssignments(studentUserId: UUID) {
        val now = Instant.now(clock)
        // Remove only this student's scope; a delegation may also cover other students.
        delegationStudentRepo.deleteByStudentUserId(studentUserId)
        assignmentRecipientRepo.findByStudentUserIdAndArchivedAtIsNullOrderByUpdatedAtDesc(studentUserId)
            .forEach { recipient -> recipient.archivedAt = now; recipient.updatedAt = now }
        lessonParticipantRepo.findByStudentUserId(studentUserId).forEach { participant ->
            val lesson = lessonRepo.findById(participant.lessonId).orElse(null)
            if (lesson?.status == MetaData.LessonStatuses.SCHEDULED) {
                lessonParticipantRepo.delete(participant)
            }
        }
    }

    @Transactional
    fun clearProfiles(userId: UUID) {
        studentProfileRepo.findByUserId(userId)?.also { profile ->
            profile.birthDate = null
            profile.parentContact = null
            profile.notes = null
            profile.currentLevel = null
            profile.lessonTranslationAllowed = false
            profile.updatedAt = Instant.now(clock)
        }
        teacherProfileRepo.findByUserId(userId)?.also { profile ->
            profile.bio = null
            profile.specializations = null
            profile.hourlyRate = null
            profile.updatedAt = Instant.now(clock)
        }
    }
}
