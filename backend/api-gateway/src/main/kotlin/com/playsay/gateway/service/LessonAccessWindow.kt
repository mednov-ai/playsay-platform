package com.playsay.gateway.service

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
): Boolean =
    status !in closedStatuses &&
        scheduledStart != null &&
        scheduledEnd != null &&
        !scheduledStart.isAfter(lessonAccessStartsBy(now)) &&
        !scheduledEnd.isBefore(lessonAccessEndsAfter(now))
