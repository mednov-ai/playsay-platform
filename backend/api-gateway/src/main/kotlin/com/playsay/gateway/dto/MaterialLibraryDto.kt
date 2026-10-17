package com.playsay.gateway.dto

import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant
import java.util.UUID

data class MaterialLibraryItemResponse(
    val id: UUID, @field:Schema(allowableValues = ["MATERIAL", "LESSON_WHITEBOARD"]) val kind: String, val title: String?, val isLessonMaterial: Boolean, val updatedAt: Instant,
    val lessonId: UUID? = null, val createdAt: Instant? = null, val cefrLevel: String? = null,
    val topicTags: List<String> = emptyList(), val skillTags: List<String> = emptyList(),
    val ageBand: String? = null, val estimatedDurationMin: Int? = null, val status: String? = null,
)
data class MaterialLibraryPageResponse(val items: List<MaterialLibraryItemResponse>, val total: Int, val offset: Int, val limit: Int)

data class MaterialLibraryQuery(
    @field:Schema(allowableValues = ["STUDY", "LESSON", "ALL"]) val category: String = "STUDY",
    @field:Schema(allowableValues = ["MATERIAL", "LESSON_WHITEBOARD"], nullable = true) val kind: String? = null,
    val query: String? = null, val level: String? = null, val topic: String? = null, val skill: String? = null,
    @field:Schema(minimum = "0") val offset: Int = 0,
    @field:Schema(minimum = "1", maximum = "200") val limit: Int = 50,
)
