package com.playsay.gateway.service
import com.playsay.gateway.dto.ScheduledLessonParticipantLinkResponse
import com.playsay.gateway.dto.ScheduledLessonParticipantLinksResponse
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.LessonParticipantRow
import com.playsay.gateway.repo.ScheduledLessonRow
import org.springframework.stereotype.Component

@Component
class ScheduledLessonParticipantLinkService(
    private val appUserRepo: AppUserRepo,
) {
    fun createLinks(
        lesson: ScheduledLessonRow,
        participants: List<LessonParticipantRow>,
        sharedUrl: String,
    ): ScheduledLessonParticipantLinksResponse {
        val usersBySubject = appUserRepo.findByKeycloakSubjectIn(participants.map { participant -> participant.subject })
            .associateBy { user -> user.keycloakSubject }
        return ScheduledLessonParticipantLinksResponse(
            lessonId = lesson.id,
            links = participants.map { participant ->
                val user = usersBySubject[participant.subject]
                val displayName = participant.displayName ?: participant.username ?: user?.displayName ?: user?.name
                ScheduledLessonParticipantLinkResponse(
                    subject = participant.subject,
                    displayName = displayName,
                    email = user?.email,
                    url = sharedUrl,
                    expiresAt = lesson.scheduledEnd?.plusSeconds(LESSON_ACCESS_GRACE_SECONDS),
                    mode = participantLinkModeShared,
                )
            },
        )
    }

    private companion object {
        const val participantLinkModeShared = "SHARED_LESSON_LINK"
    }
}
