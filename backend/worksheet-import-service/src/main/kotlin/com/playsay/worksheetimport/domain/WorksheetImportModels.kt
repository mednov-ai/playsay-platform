package com.playsay.worksheetimport.domain

import com.fasterxml.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

const val WORKSHEET_ANALYSIS_SCHEMA_VERSION = "worksheet-analysis/v1"
const val WORKSHEET_MATERIAL_BUNDLE_VERSION = "worksheet-materialization/v1"

enum class WorksheetImportStatus { ANALYZING, REVIEW_REQUIRED, READY, FAILED, MATERIALIZED }
enum class WorksheetSourceKind { IMAGE, PDF }
enum class WorksheetPageRole { WORKSHEET, ANSWER_KEY, STATIC_REFERENCE }
enum class WorksheetSectionType {
    TYPED_GAPS,
    SINGLE_CHOICE_GAPS,
    WORD_BANK_GAPS,
    FORM_TRANSFORM,
    MATCHING_TEXT_TEXT,
    MATCHING_TEXT_IMAGE,
    MULTIPLE_CHOICE,
    FLASHCARDS,
    STATIC_CONTENT,
}
enum class WorksheetInteractionType { FILL_GAPS, MATCHING_PAIRS, MULTIPLE_CHOICE, FLASHCARDS }
enum class WorksheetGapMode { TYPED, SINGLE_CHOICE, WORD_BANK, FORM_TRANSFORM }
enum class WorksheetContentKind { TEXT, IMAGE }
enum class WorksheetAnswerProvenance { ANSWER_KEY, VISIBLE_TEXT, AI_INFERENCE, TEACHER }
enum class WorksheetRegionAnchor { OCR_WORD, OCR_LINE, PRINTED_BLANK, ARTWORK, GEOMETRY }
enum class WorksheetBlockerCode {
    MISSING_ANSWER,
    LOW_CONFIDENCE,
    UNCLASSIFIED_REGION,
    INCOMPLETE_PAIR,
    INCOMPLETE_MULTIPLE_CHOICE,
    INCOMPLETE_FLASHCARD,
    INVALID_WORD_BANK,
}
enum class WorksheetUploadRejectionCode { EMPTY, UNSUPPORTED_TYPE, FILE_TOO_LARGE, PACKET_TOO_LARGE, CONTENT_MISMATCH, INVALID_IMAGE, INVALID_PDF }

data class WorksheetUploadRejection(
    val fileName: String,
    val code: WorksheetUploadRejectionCode,
)

data class NormalizedRegion(
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    val anchor: WorksheetRegionAnchor = WorksheetRegionAnchor.GEOMETRY,
    val anchorId: String? = null,
)

data class ReviewedValue(
    val value: String,
    val provenance: WorksheetAnswerProvenance,
    val confidence: Double,
    val confirmed: Boolean,
)

data class WorksheetGapItem(
    val id: String,
    val region: NormalizedRegion,
    val prompt: String? = null,
    val answer: ReviewedValue? = null,
    val acceptedAnswers: List<String> = emptyList(),
    val options: List<String> = emptyList(),
    val distractors: List<ReviewedValue> = emptyList(),
    val wordBankOptionId: String? = null,
    val baseForm: String? = null,
)

data class WorksheetPairEndpoint(
    val region: NormalizedRegion,
    val kind: WorksheetContentKind,
    val text: String? = null,
    val imageAlt: String? = null,
)

data class WorksheetPair(
    val id: String,
    val number: Int,
    val left: WorksheetPairEndpoint,
    val right: WorksheetPairEndpoint,
)

data class WorksheetChoiceOption(
    val id: String,
    val order: Int,
    val region: NormalizedRegion? = null,
    val text: String,
    val provenance: WorksheetAnswerProvenance,
    val confidence: Double,
    val confirmed: Boolean,
)

data class WorksheetMultipleChoiceItem(
    val id: String,
    val prompt: String,
    val promptRegion: NormalizedRegion? = null,
    val options: List<WorksheetChoiceOption>,
    val correctOptionIds: Set<String>,
)

data class WorksheetCardSide(
    val kind: WorksheetContentKind,
    val text: String? = null,
    val region: NormalizedRegion? = null,
    val provenance: WorksheetAnswerProvenance,
    val confidence: Double,
    val confirmed: Boolean,
)

data class WorksheetFlashcard(
    val id: String,
    val order: Int,
    val front: WorksheetCardSide,
    val back: WorksheetCardSide,
)

data class WorksheetInteractionGroup(
    val id: String,
    val order: Int,
    val type: WorksheetInteractionType,
    val gapMode: WorksheetGapMode? = null,
    val gaps: List<WorksheetGapItem> = emptyList(),
    val pairs: List<WorksheetPair> = emptyList(),
    val questions: List<WorksheetMultipleChoiceItem> = emptyList(),
    val cards: List<WorksheetFlashcard> = emptyList(),
    val wordBank: List<String> = emptyList(),
)

data class WorksheetReviewPage(
    val id: UUID,
    val order: Int,
    val role: WorksheetPageRole,
    val answerKeyPageId: UUID? = null,
    val sections: List<WorksheetSectionType> = emptyList(),
    val groups: List<WorksheetInteractionGroup> = emptyList(),
)

data class WorksheetReview(
    val pages: List<WorksheetReviewPage>,
    val attribution: String? = null,
    val rightsNote: String? = null,
)

data class WorksheetReviewBlocker(
    val code: WorksheetBlockerCode,
    val pageId: UUID,
    val groupId: String? = null,
    val itemId: String? = null,
)

data class WorksheetOcrWord(
    val id: String,
    val text: String,
    val region: NormalizedRegion,
    val confidence: Double,
)

data class WorksheetPageAnalysis(
    val schemaVersion: String = WORKSHEET_ANALYSIS_SCHEMA_VERSION,
    val pageId: UUID,
    val role: WorksheetPageRole,
    val roleConfidence: Double,
    val sections: List<WorksheetSectionType>,
    val words: List<WorksheetOcrWord>,
    val groups: List<WorksheetInteractionGroup>,
)

data class WorksheetAnswerKeyAssociation(
    val worksheetPageId: UUID,
    val answerKeyPageId: UUID,
    val confidence: Double,
)

data class WorksheetPacketResolution(
    val schemaVersion: String = WORKSHEET_ANALYSIS_SCHEMA_VERSION,
    val orderedPageIds: List<UUID>,
    val pages: List<WorksheetPageAnalysis>,
    val answerKeyAssociations: List<WorksheetAnswerKeyAssociation>,
)

data class WorksheetSourceDescriptor(
    val id: UUID,
    val order: Int,
    val kind: WorksheetSourceKind,
    val fileName: String,
    val mimeType: String,
    val byteSize: Long,
    val checksumSha256: String,
)

data class WorksheetPageDescriptor(
    val id: UUID,
    val sourceId: UUID,
    val sourcePageNumber: Int?,
    val order: Int,
    val width: Int,
    val height: Int,
    val previewPath: String,
)

data class WorksheetImportSession(
    val id: UUID,
    val ownerSubject: String,
    val status: WorksheetImportStatus,
    val revision: Long,
    val title: String,
    val language: String,
    val cefrLevel: String,
    val sources: List<WorksheetSourceDescriptor>,
    val pages: List<WorksheetPageDescriptor>,
    val analysis: JsonNode? = null,
    val review: WorksheetReview? = null,
    val blockers: List<WorksheetReviewBlocker> = emptyList(),
    val failureClass: String? = null,
    val materialId: UUID? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val expiresAt: Instant,
)

data class WorksheetMaterializationAsset(
    val id: UUID,
    val pageId: UUID?,
    val sourceId: UUID,
    val sourcePageNumber: Int?,
    val contentPath: String,
    val fileName: String,
    val mimeType: String,
    val byteSize: Long,
    val checksumSha256: String,
    val learnerVisible: Boolean,
)

data class WorksheetMaterializationBundle(
    val version: String = WORKSHEET_MATERIAL_BUNDLE_VERSION,
    val sessionId: UUID,
    val revision: Long,
    val ownerSubject: String,
    val title: String,
    val language: String,
    val cefrLevel: String,
    val document: JsonNode,
    val sourceMeta: JsonNode,
    val assets: List<WorksheetMaterializationAsset>,
)
