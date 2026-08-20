package com.playsay.gateway.service
import com.playsay.gateway.client.RegistrationGateway

import com.playsay.contract.registration.model.ManagedStudentInviteRequest
import com.playsay.gateway.dto.ScheduledLessonParticipantLinkResponse
import com.playsay.gateway.dto.ScheduledLessonParticipantLinksResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.LessonParticipantRow
import com.playsay.gateway.repo.ScheduledLessonRow
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

@Component
class ScheduledLessonParticipantLinkService(
    private val appUserRepo: AppUserRepo,
    private val registrationGateway: RegistrationGateway,
    @param:Value("\${playsay.public-app-url:https://online.honey.school}") private val publicAppUrl: String,
) {
    fun createLinks(
        lesson: ScheduledLessonRow,
        participants: List<LessonParticipantRow>,
    ): ScheduledLessonParticipantLinksResponse {
        val usersBySubject = appUserRepo.findByKeycloakSubjectIn(participants.map { participant -> participant.subject })
            .associateBy { user -> user.keycloakSubject }
        val classroomUrl = classroomUrl(lesson.id)

        return ScheduledLessonParticipantLinksResponse(
            lessonId = lesson.id,
            links = participants.map { participant ->
                val user = usersBySubject[participant.subject]
                val displayName = participant.displayName ?: participant.username ?: user?.displayName ?: user?.name
                if (user?.managedByTeacher == true) {
                    val invite = registrationGateway.createManagedStudentInvite(
                        ManagedStudentInviteRequest(
                            subject = participant.subject,
                            username = user.username
                                ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, "username"),
                            email = user.email,
                            displayName = displayName,
                            lessonId = lesson.id,
                            continueUrl = classroomUrl,
                        ),
                    )
                    ScheduledLessonParticipantLinkResponse(
                        subject = participant.subject,
                        displayName = displayName,
                        email = user.email,
                        url = inviteUrl(invite.token),
                        expiresAt = lesson.scheduledEnd?.plusSeconds(LESSON_ACCESS_GRACE_SECONDS) ?: invite.expiresAt,
                        mode = participantLinkModeMagic,
                    )
                } else {
                    ScheduledLessonParticipantLinkResponse(
                        subject = participant.subject,
                        displayName = displayName,
                        email = user?.email,
                        url = classroomUrl,
                        mode = participantLinkModeAuthenticated,
                    )
                }
            },
        )
    }

    private fun classroomUrl(lessonId: UUID): String =
        "${publicAppUrl.trimEnd('/')}/lessons/$lessonId/classroom"

    private fun inviteUrl(token: String): String =
        "${publicAppUrl.trimEnd('/')}/join#$token"

    private companion object {
        const val participantLinkModeMagic = "MAGIC_LINK"
        const val participantLinkModeAuthenticated = "AUTHENTICATED_LINK"
    }
}
