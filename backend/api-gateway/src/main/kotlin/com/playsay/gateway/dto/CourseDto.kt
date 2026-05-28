package com.playsay.gateway.dto

import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant
import java.util.UUID

data class CourseRequest(
    @field:Schema(maxLength = 160)
    val title: String,
    @field:Schema(maxLength = 2_000, nullable = true)
    val description: String? = null,
    @field:Schema(maxLength = 16, nullable = true)
    val level: String? = null,
    @field:Schema(maxLength = 16)
    val language: String = "en",
    val isPublished: Boolean = false,
)

data class CourseResponse(
    val id: UUID,
    val title: String,
    val description: String?,
    val level: String?,
    val language: String,
    val createdByUserId: UUID?,
    val isPublished: Boolean,
    val lessonCount: Int,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class CourseLessonRequest(
    @field:Schema(maxLength = 160)
    val title: String,
    @field:Schema(nullable = true)
    val orderIndex: Int? = null,
    @field:Schema(nullable = true)
    val plannedDurationMin: Int? = null,
    @field:Schema(nullable = true)
    val materialId: UUID? = null,
)

data class CourseLessonResponse(
    val id: UUID,
    val courseId: UUID,
    val title: String,
    val orderIndex: Int?,
    val plannedDurationMin: Int?,
    val materialId: UUID?,
    val materialTitle: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)
