package com.playsay.gateway.realtime

import com.playsay.gateway.ScheduledLessonResponse
import java.util.UUID

data class LessonChangedEvent(
    val lesson: ScheduledLessonResponse,
)

data class LessonDeletedEvent(
    val lessonId: UUID,
)
