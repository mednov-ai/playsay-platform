package com.playsay.gateway.dto

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant
import java.util.UUID

data class CollaborationDocumentResponse(
    val id: UUID,
    val lessonId: UUID,
    val materialId: UUID,
    val studentUserId: UUID?,
    val documentKind: String,
    val scope: String,
    val yjsDocumentId: String,
    val snapshot: JsonNode?,
    val snapshotStorageKey: String?,
    val version: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class CreateCollaborationDocumentRequest(
    val materialId: UUID,
    @field:Schema(maxLength = 40)
    val documentKind: String = "MATERIAL_WORK",
    @field:Schema(allowableValues = ["INDIVIDUAL", "GROUP"])
    val scope: String = "INDIVIDUAL",
)

data class SaveCollaborationSnapshotRequest(
    val snapshot: JsonNode,
    @field:Schema(nullable = true)
    val snapshotStorageKey: String? = null,
)

data class FinalizeCollaborationDocumentRequest(
    val submitted: Boolean = true,
)

data class CollaborationTokenResponse(
    val documentId: UUID,
    val yjsDocumentId: String,
    val websocketUrl: String,
    val token: String,
    val expiresAt: Instant,
)
