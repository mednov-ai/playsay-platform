package com.playsay.gateway.dto

import java.time.Instant
import java.util.UUID

/** Catalog summaries intentionally exclude source material/lesson and learner data. */
data class HtmlGameResponse(
    val id: UUID,
    val revisionId: UUID,
    val title: String,
    val topic: String,
    val cefrLevel: String?,
    val compatibility: String,
    val status: String,
    val canEdit: Boolean = false,
    val hasCover: Boolean,
    val version: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
    val validationStatus: String? = null,
)

data class HtmlGamePageResponse(val items: List<HtmlGameResponse>, val total: Long, val page: Int, val pageSize: Int)
data class HtmlGameEditRequest(val title: String, val topic: String = "", val cefrLevel: String? = null, val expectedVersion: Long)
data class HtmlGameForkRequest(val revisionId: UUID, val commandId: UUID)
data class MaterialGameAttachRequest(val gameId: UUID, val revisionId: UUID, val blockId: String, val pageId: String, val expectedUpdatedAt: Instant)
data class LessonGameStartRequest(val gameId: UUID, val revisionId: UUID, val commandId: UUID, val protocolVersion: Int = 1)
data class LessonGameLaunchResponse(val id: UUID, val lessonId: UUID, val gameId: UUID, val revisionId: UUID, val status: String, val documentId: UUID?, val createdAt: Instant, val presentationRevision: Long = 0)
data class HtmlGameMigrationOutcome(val assetId: UUID, val outcome: String, val errorCode: String? = null)
data class HtmlGameMigrationResponse(val dryRun: Boolean, val outcomes: List<HtmlGameMigrationOutcome>, val remaining: Long)

data class LessonGameStateResponse(val launch: LessonGameLaunchResponse?, val revision: Long, val canControl: Boolean = false, val protocolReady: Boolean = true, val primaryKind: String? = null)

data class HtmlGameMaterialRequest(val revisionId: UUID, val commandId: UUID)

data class HtmlGameProcessingRequest(val revisionId: UUID, val commandId: UUID, val kind: String)
data class HtmlGameProcessingResponse(val id: UUID, val gameId: UUID, val sourceRevisionId: UUID, val kind: String, val status: String, val errorCode: String?, val appliedRevisionId: UUID?)
data class HtmlGameRevisionSelection(val revisionId: UUID, val expectedVersion: Long)
