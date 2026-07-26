package com.playsay.gateway.realtime

import com.playsay.gateway.dto.ScheduledLessonResponse
import java.util.UUID

data class LessonChangedEvent(
    val lesson: ScheduledLessonResponse,
)

data class LessonDeletedEvent(
    val lessonId: UUID,
)

data class AssignmentChangedEvent(
    val assignmentId: UUID,
    val visibleSubjects: Set<String>,
    val change: String,
)
