package com.playsay.gateway.realtime

import com.fasterxml.jackson.annotation.JsonInclude
import com.playsay.gateway.dto.ScheduledLessonResponse
import java.time.Instant
import java.util.UUID
import com.playsay.gateway.utils.MetaData

data class LessonRealtimeInboundMessage(
    val type: String? = null,
    val lessonId: UUID? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class LessonRealtimeOutboundMessage(
    val type: String,
    val lesson: ScheduledLessonResponse? = null,
    val lessonId: UUID? = null,
    val message: String? = null,
)

data class LessonRealtimePrincipal(
    val subject: String,
    val roles: Set<String>,
) {
    fun canSee(lesson: ScheduledLessonResponse, now: Instant = Instant.now()): Boolean {
        if (roles.any { role -> role == MetaData.Roles.TEACHER || role == MetaData.Roles.ADMIN }) {
            return true
        }

        val isParticipant = lesson.participants.any { participant -> participant.subject == subject }
        val isStillAvailable = lesson.status !in expiredParticipantStatuses && lesson.scheduledEnd?.isAfter(now) != false
        return isParticipant && isStillAvailable
    }
}

private val expiredParticipantStatuses = setOf("COMPLETED", "CANCELLED")
