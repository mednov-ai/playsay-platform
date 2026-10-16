package com.playsay.gateway.service.game

import com.playsay.gateway.dto.CollaborationDocumentResponse
import com.playsay.gateway.dto.LessonGameLaunchResponse
import com.playsay.gateway.dto.LessonGameStartRequest
import com.playsay.gateway.entity.CollaborationDocumentEntity
import com.playsay.gateway.repo.CollaborationDocumentRepo
import com.playsay.gateway.repo.game.HtmlGameRepository
import com.playsay.gateway.realtime.LessonGameChangedEvent
import com.playsay.gateway.service.CollaborationDocumentService
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LessonGameService(
    private val access: LessonGameAccessService,
    private val games: HtmlGameLibraryService,
    private val repository: HtmlGameRepository,
    private val documents: CollaborationDocumentRepo,
    private val documentService: CollaborationDocumentService,
    private val events: ApplicationEventPublisher,
) {
    @Transactional(readOnly = true)
    fun current(auth: JwtAuthenticationToken, lessonId: UUID): com.playsay.gateway.dto.LessonGameStateResponse { access.requireAccess(auth, lessonId); return access.state(lessonId).copy(canControl = access.canManage(auth, lessonId), protocolReady = access.protocolReady(lessonId)) }

    @Transactional
    fun start(auth: JwtAuthenticationToken, lessonId: UUID, request: LessonGameStartRequest): LessonGameLaunchResponse {
        games.requireWritable()
        access.requireAccess(auth, lessonId, manager = true)
        if (request.protocolVersion != 1 || !access.protocolReady(lessonId)) gameError(HttpStatus.CONFLICT, "GAME_CLIENT_UPDATE_REQUIRED")
        val initiator = games.requireTeacher(auth)
        repository.launches.lockLesson(lessonId)
        val key = gameHash("${auth.token.subject}:$lessonId:${request.commandId}".toByteArray())
        val prior = repository.launches.command(key).firstOrNull()
        if (prior != null) {
            val id = prior["id"] as UUID
            val launch = access.launch(lessonId, id)
            if (launch.gameId != request.gameId || launch.revisionId != request.revisionId) gameError(HttpStatus.CONFLICT, "GAME_COMMAND_CONFLICT")
            return launch.copy(presentationRevision = access.state(lessonId).revision)
        }
        repository.lockGame(request.gameId)
        val game = games.requireNewReference(request.gameId, request.revisionId)
        if (game.compatibility !in setOf("SDK_V1", "LEGACY_PREDICTIVE", "LEGACY_MIRROR")) gameError(HttpStatus.CONFLICT, "GAME_SHARED_UNSUPPORTED")
        val previous = repository.launches.presentation(lessonId).firstOrNull()
        val returnKind = if (previous?.get("kind") == "GAME") previous["return_kind"].toString() else previous?.get("kind")?.toString() ?: "MATERIAL"
        val id = UUID.randomUUID()
        val now = Instant.now()
        val document = documents.saveAndFlush(CollaborationDocumentEntity(id = UUID.randomUUID(), lessonId = lessonId, materialId = null, gameLaunchId = id, documentKind = "LESSON_GAME", collaborationScope = "GROUP", yjsDocumentId = "lesson:$lessonId:game:$id:group:kind:LESSON_GAME", createdAt = now, updatedAt = now))
        repository.launches.stopPrevious(Timestamp.from(now), lessonId)
        repository.launches.insert(LessonGameLaunchResponse(id, lessonId, game.id, game.revisionId, "ACTIVE", document.id, now), returnKind, initiator, key)
        val changed = repository.launches.present(id, lessonId)
        if (changed == 0) repository.launches.insertPresentation(lessonId, id)
        events.publishEvent(LessonGameChangedEvent(lessonId))
        return access.launch(lessonId, id).copy(presentationRevision = access.state(lessonId).revision)
    }

    @Transactional
    fun stop(auth: JwtAuthenticationToken, lessonId: UUID, launchId: UUID): LessonGameLaunchResponse {
        access.requireAccess(auth, lessonId)
        repository.launches.lockLesson(lessonId)
        val launch = access.launch(lessonId, launchId)
        repository.launches.stop(Timestamp.from(Instant.now()), launchId)
        val returnKind = repository.launches.returnKind(launchId)?.takeIf { it in setOf("MATERIAL", "WHITEBOARD") } ?: "MATERIAL"
        // A delayed stop cannot clear a newer presentation selection.
        repository.launches.restorePresentation(returnKind, lessonId, launch.id)
        events.publishEvent(LessonGameChangedEvent(lessonId))
        return access.launch(lessonId, launchId).copy(presentationRevision = access.state(lessonId).revision)
    }

    @Transactional(readOnly = true)
    fun document(auth: JwtAuthenticationToken, lessonId: UUID, launchId: UUID): CollaborationDocumentResponse {
        access.requireAccess(auth, lessonId)
        val launch = access.launch(lessonId, launchId)
        val documentId = launch.documentId ?: gameError(HttpStatus.NOT_FOUND, "GAME_LAUNCH_NOT_FOUND")
        access.requireActiveDocument(lessonId, documentId)
        return documentService.response(documents.findById(documentId).orElseThrow())
    }
}
