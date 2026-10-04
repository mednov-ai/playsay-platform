package com.playsay.gateway.service

import com.playsay.gateway.entity.LessonEntity

import java.time.Instant

const val LESSON_ACCESS_GRACE_SECONDS: Long = 10 * 60

fun lessonAccessStartsBy(now: Instant): Instant =
    now.plusSeconds(LESSON_ACCESS_GRACE_SECONDS)

fun lessonAccessEndsAfter(now: Instant): Instant =
    now.minusSeconds(LESSON_ACCESS_GRACE_SECONDS)

fun isLessonInsideAccessWindow(
    status: String,
    scheduledStart: Instant?,
    scheduledEnd: Instant?,
    now: Instant,
    closedStatuses: Set<String>,
    accessExtensionSeconds: Int = 0,
): Boolean =
    status !in closedStatuses &&
        scheduledStart != null &&
        scheduledEnd != null &&
        !scheduledStart.isAfter(lessonAccessStartsBy(now)) &&
        now.isBefore(lessonAccessDeadline(scheduledEnd, accessExtensionSeconds))

fun lessonAccessDeadline(scheduledEnd: Instant?, accessExtensionSeconds: Int = 0): Instant? =
    scheduledEnd?.plusSeconds(LESSON_ACCESS_GRACE_SECONDS + accessExtensionSeconds.toLong())

internal fun advanceAccessPolicy(lesson: LessonEntity, values: ValidatedScheduledLessonRequest) {
    if (lesson.scheduledStart != values.scheduledStart || lesson.scheduledEnd != values.scheduledEnd) {
        lesson.accessExtensionSeconds = 0
    }
    lesson.accessRevision = Math.incrementExact(lesson.accessRevision)
}

