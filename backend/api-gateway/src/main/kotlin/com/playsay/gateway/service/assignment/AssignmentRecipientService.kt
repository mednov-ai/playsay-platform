package com.playsay.gateway.service.assignment

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.AssignmentRecipientEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.LessonParticipantRow
import com.playsay.gateway.service.StudentAccessPolicy
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

@Component
class AssignmentRecipientService(
    private val appUserRepo: AppUserRepo,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val studentAccessPolicy: StudentAccessPolicy,
) {
    fun resolve(subjects: List<String>): List<AppUserEntity> {
        val normalized = normalizeSubjects(subjects)
        if (normalized.isEmpty()) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.ASSIGNMENT_RECIPIENTS_REQUIRED,
            )
        }
        val users = appUserRepo.findByKeycloakSubjectIn(normalized).associateBy(AppUserEntity::keycloakSubject)
        val missing = normalized.firstOrNull { subject -> subject !in users }
        if (missing != null) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.UNKNOWN_PARTICIPANT_SUBJECT,
                missing,
            )
        }
        return normalized.map { subject -> requireNotNull(users[subject]) }
    }

    fun resolveLessonParticipants(
        participants: List<LessonParticipantRow>,
        requestedSubjects: List<String>?,
    ): List<AppUserEntity> {
        val selectedSubjects = requestedSubjects
            ?.let(::normalizeSubjects)
            ?.takeIf(List<String>::isNotEmpty)
            ?: participants.map(LessonParticipantRow::subject)
        if (selectedSubjects.isEmpty()) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.ASSIGNMENT_RECIPIENTS_REQUIRED,
            )
        }
        val participantsBySubject = participants.associateBy(LessonParticipantRow::subject)
        val missing = selectedSubjects.firstOrNull { subject -> subject !in participantsBySubject }
        if (missing != null) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.UNKNOWN_PARTICIPANT_SUBJECT,
                missing,
            )
        }
        val participantUserIds = selectedSubjects.map { subject -> requireNotNull(participantsBySubject[subject]).userId }
        val users = appUserRepo.findByIdIn(participantUserIds).associateBy(AppUserEntity::id)
        return participantUserIds.map { userId -> requireNotNull(users[userId]) }
    }

    fun requireAccess(
        actorUserId: UUID,
        recipients: List<AppUserEntity>,
        isAdmin: Boolean,
    ) {
        if (!isAdmin && !studentAccessPolicy.canAccessEveryStudent(actorUserId, recipients.map(AppUserEntity::id))) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.STUDENT_ACCESS_DENIED)
        }
    }

    fun canManageVocabulary(actorUserId: UUID, recipients: List<AppUserEntity>, continuation: Boolean): Boolean {
        val recipientIds = recipients.map(AppUserEntity::id)
        return if (continuation) {
            studentAccessPolicy.canAccessEveryStudent(actorUserId, recipientIds)
        } else {
            studentAccessPolicy.canManageVocabularyEveryStudent(actorUserId, recipientIds)
        }
    }

    fun save(assignmentId: UUID, recipients: List<AppUserEntity>, dueAt: Instant?, now: Instant) {
        if (recipients.isEmpty()) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.ASSIGNMENT_RECIPIENTS_REQUIRED,
            )
        }
        recipients.distinctBy(AppUserEntity::id).forEach { user ->
            val recipient = assignmentRecipientRepo.findByAssignmentIdAndStudentUserId(assignmentId, user.id)
                ?: AssignmentRecipientEntity(
                    id = UUID.randomUUID(),
                    assignmentId = assignmentId,
                    studentUserId = user.id,
                    assignedAt = now,
                    createdAt = now,
                )
            recipient.dueAt = dueAt
            recipient.archivedAt = null
            recipient.updatedAt = now
            assignmentRecipientRepo.save(recipient)
        }
    }

    private fun normalizeSubjects(subjects: List<String>): List<String> =
        subjects.mapNotNull { subject -> subject.cleanAssignmentField("studentSubjects", 255) }.distinct()
}
