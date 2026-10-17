package com.playsay.gateway.service

import com.playsay.gateway.dto.MaterialLibraryItemResponse
import com.playsay.gateway.dto.MaterialLibraryPageResponse
import com.playsay.gateway.dto.MaterialLibraryQuery
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.CollaborationDocumentRepo
import com.playsay.gateway.repo.LessonWhiteboardRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.utils.MetaData
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class MaterialLibraryIndexService(
    private val materials: LessonMaterialCatalogService,
    private val boards: LessonWhiteboardRepo,
    private val access: WhiteboardAccessService,
    private val documents: CollaborationDocumentRepo,
    private val lessons: LessonRepo,
) {
    @Transactional(readOnly = true)
    fun list(authentication: JwtAuthenticationToken, query: MaterialLibraryQuery): MaterialLibraryPageResponse {
        validate(query)
        val reusable = if (query.kind == "LESSON_WHITEBOARD") emptyList() else materialSummaries(authentication)
        val lessonBoards = if (query.category == "STUDY" || query.kind == "MATERIAL") emptyList() else boardSummaries(authentication)
        val filtered = (reusable + lessonBoards).asSequence().filter { it.matches(query) }
            .sortedWith(compareByDescending<MaterialLibraryItemResponse> { it.updatedAt }.thenBy { it.kind }.thenBy { it.id })
            .toList()
        return MaterialLibraryPageResponse(filtered.drop(query.offset).take(query.limit), filtered.size, query.offset, query.limit)
    }

    private fun materialSummaries(authentication: JwtAuthenticationToken) = materials.list(authentication).map {
        MaterialLibraryItemResponse(it.id, "MATERIAL", it.title, it.isLessonMaterial, it.updatedAt,
            createdAt = it.createdAt, cefrLevel = it.cefrLevel, topicTags = it.topicTags, skillTags = it.skillTags,
            ageBand = it.ageBand, estimatedDurationMin = it.estimatedDurationMin, status = it.status)
    }

    private fun boardSummaries(authentication: JwtAuthenticationToken) = boards.findAll().mapNotNull { board ->
        try {
            access.requireRead(authentication, board.lessonId, board)
            val updatedAt = maxOf(board.updatedAt, documents.findById(board.documentId).orElse(null)?.updatedAt ?: board.updatedAt)
            MaterialLibraryItemResponse(board.id, "LESSON_WHITEBOARD", lessons.findScheduleRowById(board.lessonId)?.lessonTitle,
                true, updatedAt, lessonId = board.lessonId, createdAt = board.createdAt)
        } catch (_: ProjectResponseException) { null }
    }

    private fun validate(query: MaterialLibraryQuery) {
        if (query.category !in setOf("STUDY", "LESSON", "ALL") || query.kind !in setOf(null, "MATERIAL", "LESSON_WHITEBOARD") ||
            query.offset < 0 || query.limit !in 1..200 || query.query.orEmpty().length > 200) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SCOPE_INVALID)
        }
    }

    private fun MaterialLibraryItemResponse.matches(query: MaterialLibraryQuery): Boolean =
        (query.category == "ALL" || isLessonMaterial == (query.category == "LESSON")) &&
            (query.level.isNullOrBlank() || cefrLevel.equals(query.level, ignoreCase = true)) &&
            (query.topic.isNullOrBlank() || topicTags.any { it.contains(query.topic, ignoreCase = true) }) &&
            (query.skill.isNullOrBlank() || skillTags.any { it.contains(query.skill, ignoreCase = true) }) &&
            (query.query.isNullOrBlank() || title.orEmpty().contains(query.query, ignoreCase = true))
}
