package com.playsay.gateway.service.game

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.repo.game.HtmlGameRepository
import com.playsay.gateway.service.MaterialObjectStorage
import com.playsay.gateway.service.MaterialReadAccessPolicy
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HtmlGameContentService(
    private val games: HtmlGameLibraryService,
    private val repository: HtmlGameRepository,
    private val materialAccess: MaterialReadAccessPolicy,
    private val blobs: GameBlobStorageService,
    private val mapper: ObjectMapper,
    private val lessonAccess: LessonGameAccessService,
) {
    @Transactional(readOnly = true)
    fun content(auth: JwtAuthenticationToken, gameId: UUID, revisionId: UUID, materialId: UUID?, cover: Boolean = false): ResponseEntity<ByteArray> {
        games.requireGame(gameId, revisionId)
        if (!games.isTeacher(auth)) {
            val material = materialId?.let { materialAccess.requireReadable(auth, it) } ?: gameError(HttpStatus.NOT_FOUND, "GAME_NOT_FOUND")
            val document = mapper.readTree(material.document)
            if (!document.path("pages").any { page -> page.path("blocks").any { block -> block.path("type").asText() == "htmlGame" && block.path("gameId").asText() == gameId.toString() && block.path("gameRevisionId").asText() == revisionId.toString() } }) gameError(HttpStatus.NOT_FOUND, "GAME_NOT_FOUND")
        }
        return bytes(revisionId, cover)
    }

    @Transactional(readOnly = true)
    fun forLaunch(auth: JwtAuthenticationToken, lessonId: UUID, launchId: UUID): ResponseEntity<ByteArray> {
        lessonAccess.requireAccess(auth, lessonId)
        val launch = lessonAccess.launch(lessonId, launchId)
        lessonAccess.requireActiveDocument(lessonId, launch.documentId ?: gameError(HttpStatus.NOT_FOUND, "GAME_LAUNCH_NOT_FOUND"))
        return bytes(launch.revisionId, false)
    }

    private fun bytes(revisionId: UUID, cover: Boolean): ResponseEntity<ByteArray> {
        val blob = repository.blob(revisionId, cover) ?: gameError(HttpStatus.NOT_FOUND, "GAME_CONTENT_NOT_FOUND")
        val bytes = blobs.readVerified(blob)
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(blob.contentType)).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff").header("Content-Security-Policy", "sandbox; default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'").body(bytes)
    }
}
