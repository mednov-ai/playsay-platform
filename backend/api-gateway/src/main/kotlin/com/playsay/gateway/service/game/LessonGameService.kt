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
        repository.jdbc.queryForList("SELECT id FROM lesson WHERE id=? FOR UPDATE", lessonId)
        val key = gameHash("${auth.token.subject}:$lessonId:${request.commandId}".toByteArray())
        val prior = repository.jdbc.queryForList("SELECT id,game_id,revision_id FROM lesson_game_launch WHERE command_key=?", key).firstOrNull()
        if (prior != null) {
            val id = prior["id"] as UUID
            val launch = access.launch(lessonId, id)
            if (launch.gameId != request.gameId || launch.revisionId != request.revisionId) gameError(HttpStatus.CONFLICT, "GAME_COMMAND_CONFLICT")
            return launch.copy(presentationRevision = access.state(lessonId).revision)
        }
        repository.lockGame(request.gameId)
        val game = games.requireNewReference(request.gameId, request.revisionId)
        if (game.compatibility !in setOf("SDK_V1", "LEGACY_PREDICTIVE", "LEGACY_MIRROR")) gameError(HttpStatus.CONFLICT, "GAME_SHARED_UNSUPPORTED")
        val previous = repository.jdbc.queryForList("SELECT p.kind,l.return_kind FROM lesson_presentation p LEFT JOIN lesson_game_launch l ON l.id=p.game_launch_id WHERE p.lesson_id=?", lessonId).firstOrNull()
        val returnKind = if (previous?.get("kind") == "GAME") previous["return_kind"].toString() else previous?.get("kind")?.toString() ?: "MATERIAL"
        val id = UUID.randomUUID()
        val now = Instant.now()
        val document = documents.saveAndFlush(CollaborationDocumentEntity(id = UUID.randomUUID(), lessonId = lessonId, materialId = null, gameLaunchId = id, documentKind = "LESSON_GAME", collaborationScope = "GROUP", yjsDocumentId = "lesson:$lessonId:game:$id:group:kind:LESSON_GAME", createdAt = now, updatedAt = now))
        repository.jdbc.update("UPDATE lesson_game_launch SET status='STOPPED',stopped_at=? WHERE lesson_id=? AND status='ACTIVE'", Timestamp.from(now), lessonId)
        repository.jdbc.update("INSERT INTO lesson_game_launch(id,lesson_id,game_id,revision_id,status,document_id,return_kind,initiator_user_id,command_key,created_at) VALUES(?,?,?,?,'ACTIVE',?,?,?,?,?)", id, lessonId, game.id, game.revisionId, document.id, returnKind, initiator, key, Timestamp.from(now))
        val changed = repository.jdbc.update("UPDATE lesson_presentation SET kind='GAME',game_launch_id=?,revision=revision+1 WHERE lesson_id=?", id, lessonId)
        if (changed == 0) repository.jdbc.update("INSERT INTO lesson_presentation(lesson_id,kind,game_launch_id,revision) VALUES(?,'GAME',?,1)", lessonId, id)
        events.publishEvent(LessonGameChangedEvent(lessonId))
        return access.launch(lessonId, id).copy(presentationRevision = access.state(lessonId).revision)
    }

    @Transactional
    fun stop(auth: JwtAuthenticationToken, lessonId: UUID, launchId: UUID): LessonGameLaunchResponse {
        access.requireAccess(auth, lessonId)
        repository.jdbc.queryForList("SELECT id FROM lesson WHERE id=? FOR UPDATE", lessonId)
        val launch = access.launch(lessonId, launchId)
        repository.jdbc.update("UPDATE lesson_game_launch SET status='STOPPED',stopped_at=? WHERE id=? AND status='ACTIVE'", Timestamp.from(Instant.now()), launchId)
        val returnKind = repository.jdbc.queryForObject("SELECT return_kind FROM lesson_game_launch WHERE id=?", String::class.java, launchId)?.takeIf { it in setOf("MATERIAL", "WHITEBOARD") } ?: "MATERIAL"
        // A delayed stop cannot clear a newer presentation selection.
        repository.jdbc.update("UPDATE lesson_presentation SET kind=?,game_launch_id=NULL,revision=revision+1 WHERE lesson_id=? AND game_launch_id=?", returnKind, lessonId, launch.id)
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
