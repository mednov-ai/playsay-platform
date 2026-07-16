package com.playsay.gateway.service

import com.playsay.gateway.dto.ScheduledLessonRecurrenceRequest
import com.playsay.gateway.dto.ScheduledLessonRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.time.DateTimeException
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID
import org.springframework.http.HttpStatus

internal data class ValidatedScheduledLessonRequest(
    val lessonTemplateId: UUID?,
    val materialId: UUID?,
    val inheritTemplateMaterial: Boolean,
    val scheduledStart: Instant?,
    val scheduledEnd: Instant?,
    val status: String,
    val type: String,
    val workMode: String,
    val participantSubjects: List<String>,
    val participantAssignments: List<ValidatedScheduledLessonMaterialAssignment>,
    val recurrence: ValidatedScheduledLessonRecurrence?,
)

internal data class ValidatedScheduledLessonMaterialAssignment(
    val materialId: UUID,
    val participantSubjects: List<String>,
)

internal data class ValidatedScheduledLessonRecurrence(
    val mode: String,
    val count: Int,
    val weekdays: Set<DayOfWeek>,
    val weekdayTimes: Map<DayOfWeek, LocalTime>,
    val timeZone: ZoneId,
)

internal data class ScheduledLessonOccurrence(
    val scheduledStart: Instant?,
    val scheduledEnd: Instant?,
)

internal fun ScheduledLessonRequest.validated(allowRecurrence: Boolean = true): ValidatedScheduledLessonRequest {
    if (scheduledStart != null && scheduledEnd != null && !scheduledEnd.isAfter(scheduledStart)) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.SCHEDULED_END_BEFORE_START)
    }

    val cleanedStatus = status.trim().uppercase()
    if (cleanedStatus !in scheduleStatuses) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_LESSON_STATUS)
    }

    val cleanedType = type.trim().uppercase()
    if (cleanedType !in scheduleTypes) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_LESSON_TYPE)
    }

    val cleanedWorkMode = workMode.trim().uppercase()
    if (cleanedWorkMode !in scheduleWorkModes) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_LESSON_WORK_MODE)
    }

    if (!allowRecurrence && recurrence != null) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_LESSON_RECURRENCE)
    }

    val inheritsTemplateMaterial = when {
        cleanedWorkMode != MetaData.LessonWorkModes.SHARED -> false
        materialId != null -> false
        inheritTemplateMaterial != null -> inheritTemplateMaterial && lessonTemplateId != null
        lessonTemplateId != null -> true
        else -> false
    }

    return ValidatedScheduledLessonRequest(
        lessonTemplateId = lessonTemplateId,
        materialId = materialId,
        inheritTemplateMaterial = inheritsTemplateMaterial,
        scheduledStart = scheduledStart,
        scheduledEnd = scheduledEnd,
        status = cleanedStatus,
        type = cleanedType,
        workMode = cleanedWorkMode,
        participantSubjects = participantSubjects.mapNotNull { subject -> subject.trim().takeIf { it.isNotEmpty() } }.distinct(),
        participantAssignments = participantAssignments.map { assignment ->
            ValidatedScheduledLessonMaterialAssignment(
                materialId = assignment.materialId,
                participantSubjects = assignment.participantSubjects
                    .mapNotNull { subject -> subject.trim().takeIf { it.isNotEmpty() } }
                    .distinct(),
            )
        },
        recurrence = recurrence?.validated(scheduledStart, scheduledEnd),
    )
}

private fun ScheduledLessonRecurrenceRequest.validated(
    scheduledStart: Instant?,
    scheduledEnd: Instant?,
): ValidatedScheduledLessonRecurrence {
    if (scheduledStart == null) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, "scheduledStart")
    }
    if (scheduledEnd == null) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, "scheduledEnd")
    }

    val cleanedMode = mode.trim().uppercase()
    if (cleanedMode !in lessonRecurrenceModes) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_LESSON_RECURRENCE)
    }
    val validCountRange = if (cleanedMode == MetaData.LessonRecurrenceModes.WEEKLY_BY_WEEK) 1..52 else 2..52
    if (count !in validCountRange) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.LESSON_RECURRENCE_COUNT_OUT_OF_RANGE)
    }

    val cleanedWeekdays = weekdays.mapNotNull { value -> value.trim().takeIf { it.isNotEmpty() } }
    if (cleanedWeekdays.isEmpty()) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.LESSON_RECURRENCE_WEEKDAY_INVALID)
    }
    val parsedWeekdays = cleanedWeekdays.map { value ->
        runCatching { DayOfWeek.valueOf(value.uppercase()) }.getOrElse {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.LESSON_RECURRENCE_WEEKDAY_INVALID)
        }
    }.toSet()
    val parsedWeekdayTimes = if (cleanedMode == MetaData.LessonRecurrenceModes.WEEKLY_BY_WEEK) {
        parsedWeekdays.associateWith { weekday ->
            val rawTime = weekdayTimes[weekday.name]?.trim()
                ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.LESSON_RECURRENCE_WEEKDAY_INVALID)
            runCatching { LocalTime.parse(rawTime) }.getOrElse {
                throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.LESSON_RECURRENCE_WEEKDAY_INVALID)
            }
        }
    } else {
        emptyMap()
    }

    val zoneId = runCatching { ZoneId.of(timeZone.trim()) }.getOrElse { error ->
        if (error is DateTimeException) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.LESSON_RECURRENCE_TIME_ZONE_INVALID)
        }
        throw error
    }

    return ValidatedScheduledLessonRecurrence(
        mode = cleanedMode,
        count = count,
        weekdays = parsedWeekdays,
        weekdayTimes = parsedWeekdayTimes,
        timeZone = zoneId,
    )
}

internal fun ValidatedScheduledLessonRequest.occurrences(): List<ScheduledLessonOccurrence> {
    val recurrence = recurrence ?: return listOf(ScheduledLessonOccurrence(scheduledStart, scheduledEnd))
    val start = requireNotNull(scheduledStart)
    val end = requireNotNull(scheduledEnd)
    val duration = Duration.between(start, end)
    val firstLocalStart = start.atZone(recurrence.timeZone)
    val localStartTime = firstLocalStart.toLocalTime()
    var date = firstLocalStart.toLocalDate()
    val occurrences = mutableListOf<ScheduledLessonOccurrence>()
    val targetCount = if (recurrence.mode == MetaData.LessonRecurrenceModes.WEEKLY_BY_WEEK) {
        recurrence.count * recurrence.weekdays.size
    } else {
        recurrence.count
    }

    while (occurrences.size < targetCount) {
        if (date.dayOfWeek in recurrence.weekdays) {
            val candidateStart = date.atTime(recurrence.weekdayTimes[date.dayOfWeek] ?: localStartTime).atZone(recurrence.timeZone).toInstant()
            if (!candidateStart.isBefore(start)) {
                occurrences += ScheduledLessonOccurrence(
                    scheduledStart = candidateStart,
                    scheduledEnd = candidateStart.plus(duration),
                )
            }
        }
        date = date.plusDays(1)
    }

    return occurrences
}

private val scheduleStatuses = setOf(
    MetaData.LessonStatuses.SCHEDULED,
    MetaData.LessonStatuses.IN_PROGRESS,
    MetaData.LessonStatuses.COMPLETED,
    MetaData.LessonStatuses.CANCELLED,
)
private val scheduleTypes = setOf(MetaData.LessonTypes.INDIVIDUAL, MetaData.LessonTypes.GROUP)
private val scheduleWorkModes = setOf(MetaData.LessonWorkModes.SHARED, MetaData.LessonWorkModes.PARALLEL)
private val lessonRecurrenceModes = setOf(
    MetaData.LessonRecurrenceModes.WEEKLY_COUNT,
    MetaData.LessonRecurrenceModes.WEEKLY_BY_WEEK,
)
