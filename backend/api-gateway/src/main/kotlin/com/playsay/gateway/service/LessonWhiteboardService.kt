package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.dto.*
import com.playsay.gateway.entity.CollaborationDocumentEntity
import com.playsay.gateway.entity.LessonWhiteboardEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.CollaborationDocumentRepo
import com.playsay.gateway.repo.LessonWhiteboardRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LessonWhiteboardService(
    private val boards: LessonWhiteboardRepo,
    private val documents: CollaborationDocumentRepo,
    private val lessons: LessonRepo,
    private val users: AppUserRepo,
    private val access: WhiteboardAccessService,
    private val mapper: ObjectMapper,
    private val events: ApplicationEventPublisher,
    private val feature: com.playsay.gateway.config.WhiteboardFeatureConfig,
) {
    @Transactional(readOnly = true)
    fun current(authentication: JwtAuthenticationToken, lessonId: UUID, studentSubject: String?): LessonWhiteboardContextResponse {
        val (_, studentId) = access.context(authentication, lessonId, studentSubject)
        return LessonWhiteboardContextResponse(feature.enabled, access.canManage(authentication, lessonId),
            boards.findByLessonIdAndContextKey(lessonId, contextKey(studentId))?.let { response(authentication, it) })
    }

    @Transactional
    fun ensure(authentication: JwtAuthenticationToken, lessonId: UUID, studentSubject: String?): LessonWhiteboardResponse {
        if (!feature.enabled) access.denied()
        lessons.lockById(lessonId) ?: access.missing()
        val (lesson, studentId) = access.context(authentication, lessonId, studentSubject)
        if (!access.canManage(authentication, lessonId)) access.denied()
        access.requireActive(authentication, lesson)
        val now = access.now()
        val board = boards.findByLessonIdAndContextKey(lessonId, contextKey(studentId)) ?: run {
            val id = UUID.randomUUID()
            val document = documents.saveAndFlush(CollaborationDocumentEntity(
                lessonId = lessonId, materialId = null, studentUserId = studentId, documentKind = "LESSON_WHITEBOARD",
                collaborationScope = if (studentId == null) "GROUP" else "INDIVIDUAL", yjsDocumentId = roomName(lessonId, id, 0),
                createdAt = now, updatedAt = now,
            ))
            boards.saveAndFlush(LessonWhiteboardEntity(id = id, lessonId = lessonId, studentUserId = studentId,
                contextKey = contextKey(studentId), documentId = document.id, createdAt = now, updatedAt = now))
        }
        board.activeSurface = "WHITEBOARD"
        changed(board)
        return response(authentication, board)
    }

    @Transactional
    fun update(authentication: JwtAuthenticationToken, lessonId: UUID, boardId: UUID, request: UpdateLessonWhiteboardRequest): LessonWhiteboardResponse {
        val board = boards.lockById(boardId) ?: access.missing()
        access.requireRead(authentication, lessonId, board)
        if (!feature.enabled || !access.canManage(authentication, lessonId)) access.denied()
        access.requireActive(authentication, lessons.findById(lessonId).orElse(null) ?: access.missing())
        if (request.expectedRevision != board.controlRevision) throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.COLLABORATION_SNAPSHOT_INVALID)
        request.background?.let {
            if (!it.matches(Regex("#[0-9a-fA-F]{6}"))) invalid()
            board.background = it.lowercase()
        }
        request.learnerInkEnabled?.let { board.learnerInkEnabled = it }
        request.activeSurface?.let {
            if (it !in setOf("MATERIAL", "WHITEBOARD")) invalid()
            board.activeSurface = it
        }
        if (request.clear) {
            board.contentEpoch += 1
            val previousId = board.documentId
            val now = access.now()
            val document = documents.saveAndFlush(CollaborationDocumentEntity(
                lessonId = lessonId, materialId = null, studentUserId = board.studentUserId, documentKind = "LESSON_WHITEBOARD",
                collaborationScope = if (board.studentUserId == null) "GROUP" else "INDIVIDUAL",
                yjsDocumentId = roomName(lessonId, board.id, board.contentEpoch), createdAt = now, updatedAt = now,
            ))
            board.documentId = document.id
            boards.saveAndFlush(board)
            documents.deleteById(previousId)
        }
        changed(board)
        return response(authentication, board)
    }

    @Transactional(readOnly = true)
    fun get(authentication: JwtAuthenticationToken, lessonId: UUID, boardId: UUID): LessonWhiteboardResponse {
        val board = boards.findById(boardId).orElse(null) ?: access.missing()
        access.requireRead(authentication, lessonId, board)
        return response(authentication, board)
    }

    @Transactional(readOnly = true)
    fun history(authentication: JwtAuthenticationToken, lessonId: UUID): List<LessonWhiteboardSummaryResponse> =
        boards.findByLessonId(lessonId).mapNotNull { board ->
            try {
                access.requireRead(authentication, lessonId, board)
                val student = board.studentUserId?.let { users.findById(it).orElse(null) }
                LessonWhiteboardSummaryResponse(board.id, lessonId, student?.displayName ?: student?.username, maxOf(board.updatedAt, documents.findById(board.documentId).orElse(null)?.updatedAt ?: board.updatedAt))
            } catch (_: ProjectResponseException) { null }
        }

    @Transactional(readOnly = true)
    fun policy(presentedToken: String?, documentId: UUID, request: WhiteboardPolicyRequest): WhiteboardPolicyResponse {
        val expected = feature.serviceToken.trim()
        if (expected.length < 32 || presentedToken?.trim() != expected) access.denied()
        val board = boards.findByDocumentId(documentId) ?: access.missing()
        if (!feature.enabled || board.contentEpoch != request.contentEpoch) access.denied()
        val manager = access.requireSubjectWrite(request.subject, board)
        return WhiteboardPolicyResponse(manager, manager || board.learnerInkEnabled, board.contentEpoch, board.controlRevision)
    }

    private fun changed(board: LessonWhiteboardEntity) {
        board.controlRevision += 1
        board.updatedAt = access.now()
        boards.saveAndFlush(board)
        events.publishEvent(LessonWhiteboardChanged(board.lessonId, board.studentUserId?.let { users.findById(it).orElse(null)?.keycloakSubject }))
    }

    private fun response(authentication: JwtAuthenticationToken, board: LessonWhiteboardEntity): LessonWhiteboardResponse {
        val doc = documents.findById(board.documentId).orElse(null) ?: access.missing()
        val manager = access.canManage(authentication, board.lessonId)
        val lesson = lessons.findById(board.lessonId).orElse(null) ?: access.missing()
        val active = access.isActive(lesson)
        val student = board.studentUserId?.let { users.findById(it).orElse(null) }
        return LessonWhiteboardResponse(board.id, board.lessonId, doc.collaborationScope, student?.keycloakSubject,
            board.background, board.learnerInkEnabled, board.contentEpoch, board.controlRevision, board.activeSurface,
            manager, feature.enabled && active && (manager || board.learnerInkEnabled), !active,
            CollaborationDocumentResponse(doc.id, doc.lessonId, null, doc.studentUserId, student?.keycloakSubject,
                student?.displayName, doc.documentKind, doc.collaborationScope, doc.yjsDocumentId,
                doc.snapshotJson?.let(mapper::readTree), doc.snapshotStorageKey, doc.version, doc.createdAt, doc.updatedAt),
            board.createdAt, maxOf(board.updatedAt, doc.updatedAt))
    }

    private fun invalid(): Nothing = throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SNAPSHOT_INVALID)
    private fun contextKey(studentId: UUID?): String = studentId?.toString() ?: "GROUP"
    private fun roomName(lessonId: UUID, id: UUID, epoch: Long): String = "lesson:$lessonId:whiteboard:$id:epoch:$epoch"
}

data class LessonWhiteboardChanged(val lessonId: UUID, val studentSubject: String?)
