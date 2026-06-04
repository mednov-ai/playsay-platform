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

data class CurriculumTopicRequest(
    @field:Schema(maxLength = 160)
    val title: String,
    @field:Schema(maxLength = 2_000, nullable = true)
    val description: String? = null,
    @field:Schema(nullable = true)
    val orderIndex: Int? = null,
    val tagSlugs: List<String> = emptyList(),
)

data class CurriculumTopicResponse(
    val id: UUID,
    val courseId: UUID,
    val title: String,
    val description: String?,
    val orderIndex: Int?,
    val tagSlugs: List<String>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class LessonTemplateCardRequest(
    val materialId: UUID,
    @field:Schema(nullable = true)
    val orderIndex: Int? = null,
    @field:Schema(maxLength = 32)
    val role: String = "MAIN",
    @field:Schema(nullable = true)
    val plannedDurationMin: Int? = null,
)

data class LessonTemplateCardsRequest(
    val cards: List<LessonTemplateCardRequest> = emptyList(),
)

data class LessonTemplateCardResponse(
    val id: UUID,
    val lessonTemplateId: UUID,
    val materialId: UUID,
    val materialTitle: String,
    val orderIndex: Int?,
    val role: String,
    val plannedDurationMin: Int?,
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
    val topicId: UUID? = null,
    @field:Schema(nullable = true)
    val materialId: UUID? = null,
    @field:Schema(nullable = true)
    val cards: List<LessonTemplateCardRequest>? = null,
)

data class CourseLessonResponse(
    val id: UUID,
    val courseId: UUID,
    val title: String,
    val orderIndex: Int?,
    val plannedDurationMin: Int?,
    val topicId: UUID?,
    val topicTitle: String?,
    val materialId: UUID?,
    val materialTitle: String?,
    val cards: List<LessonTemplateCardResponse>,
    val createdAt: Instant,
    val updatedAt: Instant,
)
