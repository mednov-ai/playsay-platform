package com.playsay.gateway.service

import com.playsay.gateway.dto.StudentInviteConsumeRequest
import com.playsay.gateway.dto.StudentInviteConsumeResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Instant
import kotlin.math.max
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class StudentInviteService(
    private val registrationGateway: RegistrationGateway,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun consume(request: StudentInviteConsumeRequest, clientAddress: String?): StudentInviteConsumeResponse {
        val invite = registrationGateway.lookupManagedStudentInvite(request, clientAddress)
        val lesson = lessonRepo.findById(invite.lessonId).orElseThrow {
            invalidInvite()
        }
        if (!lessonParticipantRepo.existsByLessonIdAndSubject(invite.lessonId, invite.subject)) {
            throw invalidInvite()
        }

        val now = Instant.now(clock)
        if (isLessonInsideAccessWindow(lesson.status, lesson.scheduledStart, lesson.scheduledEnd, now, closedLessonStatuses)) {
            return registrationGateway.consumeStudentInvite(request, clientAddress).copy(status = "AUTHENTICATED")
        }
        if (lesson.status in closedLessonStatuses || lesson.scheduledStart == null || lesson.scheduledEnd == null) {
            throw invalidInvite()
        }

        val opensAt = lesson.scheduledStart!!.minusSeconds(LESSON_ACCESS_GRACE_SECONDS)
        if (now.isBefore(opensAt)) {
            return StudentInviteConsumeResponse(
                status = "WAITING",
                continueUrl = invite.continueUrl,
                opensAt = opensAt,
                scheduledStart = lesson.scheduledStart,
                scheduledEnd = lesson.scheduledEnd,
                retryAfterSeconds = max(1, opensAt.epochSecond - now.epochSecond),
            )
        }
        throw invalidInvite()
    }

    private fun invalidInvite(): ProjectResponseException =
        ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.INVALID_REQUEST)

    private companion object {
        val closedLessonStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
    }
}
