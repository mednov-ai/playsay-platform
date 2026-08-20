package com.playsay.gateway.realtime

import com.playsay.gateway.dto.ScheduledLessonResponse
import java.time.Instant
import java.util.UUID

data class LessonDiceRoll(
    val eventId: UUID,
    val lessonId: UUID,
    val requestId: UUID,
    val value: Int,
    val rollerSubject: String,
    val rollerName: String,
    val rolledAt: Instant,
    val cooldownUntil: Instant,
) {
    fun toMessage(type: String): LessonRealtimeOutboundMessage =
        LessonRealtimeOutboundMessage(
            type = type,
            eventId = eventId,
            lessonId = lessonId,
            requestId = requestId,
            value = value,
            rollerSubject = rollerSubject,
            rollerName = rollerName,
            rolledAt = rolledAt,
            cooldownUntil = cooldownUntil,
        )
}

object LessonDiceRejectionCodes {
    const val COOLDOWN = "COOLDOWN"
    const val LESSON_NOT_ACTIVE = "LESSON_NOT_ACTIVE"
    const val FORBIDDEN = "FORBIDDEN"
}

fun ScheduledLessonResponse.diceRollerName(subject: String): String =
    when (subject) {
        teacherSubject -> teacherName
        else -> participants.firstOrNull { participant -> participant.subject == subject }?.displayName
    }?.takeIf(String::isNotBlank) ?: subject

const val DICE_COOLDOWN_MILLIS = 2_000L
