package com.playsay.gateway.dto

import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant
import java.util.UUID

data class LessonWhiteboardResponse(
    val id: UUID,
    val lessonId: UUID,
    @field:Schema(allowableValues = ["GROUP", "INDIVIDUAL"])
    val scope: String,
    val studentSubject: String?,
    @field:Schema(pattern = "^#[0-9a-fA-F]{6}$")
    val background: String,
    val learnerInkEnabled: Boolean,
    @field:Schema(minimum = "0")
    val contentEpoch: Long,
    val controlRevision: Long,
    @field:Schema(allowableValues = ["MATERIAL", "WHITEBOARD"])
    val activeSurface: String,
    val canManage: Boolean,
    val canDraw: Boolean,
    val readOnly: Boolean,
    val document: CollaborationDocumentResponse,
    val createdAt: Instant,
    val updatedAt: Instant,
)
data class LessonWhiteboardContextResponse(val enabled: Boolean, val canManage: Boolean, val board: LessonWhiteboardResponse?)
data class UpdateLessonWhiteboardRequest(
    val expectedRevision: Long,
    val background: String? = null,
    val learnerInkEnabled: Boolean? = null,
    @field:Schema(allowableValues = ["MATERIAL", "WHITEBOARD"], nullable = true)
    val activeSurface: String? = null,
    val clear: Boolean = false,
)
data class WhiteboardPolicyRequest(val subject: String, val contentEpoch: Long)
data class WhiteboardPolicyResponse(val canManage: Boolean, val canDraw: Boolean, val contentEpoch: Long, val controlRevision: Long)
data class LessonWhiteboardSummaryResponse(val id: UUID, val lessonId: UUID, val studentName: String?, val updatedAt: Instant)
