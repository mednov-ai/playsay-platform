package com.playsay.gateway.realtime

import com.fasterxml.jackson.annotation.JsonInclude
import com.playsay.gateway.dto.ScheduledLessonResponse
import com.playsay.gateway.service.lessonAccessEndsAfter
import java.time.Instant
import java.util.UUID
import com.playsay.gateway.utils.MetaData

data class LessonRealtimeInboundMessage(
    val type: String? = null,
    val lessonId: UUID? = null,
    val state: String? = null,
)

data class LessonParticipantPresence(
    val subject: String,
    val state: String,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class LessonRealtimeOutboundMessage(
    val type: String,
    val lesson: ScheduledLessonResponse? = null,
    val lessonId: UUID? = null,
    val participants: List<LessonParticipantPresence>? = null,
    val message: String? = null,
)

data class LessonRealtimePrincipal(
    val subject: String,
    val roles: Set<String>,
) {
    fun canManagePresence(): Boolean =
        roles.any { role -> role == MetaData.Roles.TEACHER || role == MetaData.Roles.ADMIN }

    fun canReportPresence(lesson: ScheduledLessonResponse): Boolean =
        MetaData.Roles.STUDENT in roles && lesson.participants.any { participant -> participant.subject == subject }

    fun canSee(lesson: ScheduledLessonResponse, now: Instant = Instant.now()): Boolean {
        if (canManagePresence()) {
            return true
        }

        val isParticipant = lesson.participants.any { participant -> participant.subject == subject }
        val isStillAvailable = lesson.status !in expiredParticipantStatuses &&
            (lesson.scheduledEnd == null || !lesson.scheduledEnd.isBefore(lessonAccessEndsAfter(now)))
        return isParticipant && isStillAvailable
    }
}

object LessonPresenceStates {
    const val OFFLINE = "OFFLINE"
    const val ONLINE = "ONLINE"
    const val CHECKING_DEVICES = "CHECKING_DEVICES"

    val reportable = setOf(ONLINE, CHECKING_DEVICES)
}

private val expiredParticipantStatuses = setOf("COMPLETED", "CANCELLED")
