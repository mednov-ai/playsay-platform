package com.playsay.vocabulary.controller

import com.playsay.vocabulary.dto.VocabularyMediaImageabilityRequest
import com.playsay.vocabulary.dto.VocabularyMediaOverrideRequest
import com.playsay.vocabulary.dto.VocabularyMediaReportRequest
import com.playsay.vocabulary.dto.VocabularyMediaReviewRequest
import com.playsay.vocabulary.service.VocabularyMediaService
import jakarta.validation.Valid
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.Duration

@RestController
@RequestMapping("/api/vocabulary")
class VocabularyMediaController(private val media: VocabularyMediaService) {
    @GetMapping("/entries/{entryId}/media")
    fun view(auth: JwtAuthenticationToken, @PathVariable entryId: UUID) = media.view(auth.token.subject, entryId)

    @PostMapping("/entries/{entryId}/media/regenerate")
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun regenerate(auth: JwtAuthenticationToken, @PathVariable entryId: UUID) = media.regenerate(auth.token.subject, entryId)

    @PutMapping("/entries/{entryId}/media/override")
    fun override(auth: JwtAuthenticationToken, @PathVariable entryId: UUID, @Valid @RequestBody request: VocabularyMediaOverrideRequest) =
        media.override(auth.token.subject, entryId, request)

    @PostMapping("/entries/{entryId}/media/assets/{assetId}/report")
    fun report(auth: JwtAuthenticationToken, @PathVariable entryId: UUID, @PathVariable assetId: UUID, @Valid @RequestBody request: VocabularyMediaReportRequest) =
        media.report(auth.token.subject, entryId, assetId, request)

    @GetMapping("/media/candidates")
    fun candidates(
        auth: JwtAuthenticationToken,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "50") size: Int,
    ) = media.candidates(auth.token.subject, auth.isMediaReviewer(), page, size)

    @GetMapping("/media/candidates/{assetId}")
    fun candidate(auth: JwtAuthenticationToken, @PathVariable assetId: UUID) = media.candidate(auth.token.subject, auth.isMediaReviewer(), assetId)

    @PatchMapping("/media/candidates/{assetId}")
    fun review(auth: JwtAuthenticationToken, @PathVariable assetId: UUID, @Valid @RequestBody request: VocabularyMediaReviewRequest) =
        media.review(auth.token.subject, auth.isMediaReviewer(), assetId, request)

    @PatchMapping("/media/senses/{senseId}/imageability")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun imageability(auth: JwtAuthenticationToken, @PathVariable senseId: UUID, @Valid @RequestBody request: VocabularyMediaImageabilityRequest) =
        media.imageability(auth.token.subject, auth.isMediaReviewer(), senseId, request)

    @GetMapping("/entries/{entryId}/media/assets/{assetId}/content")
    fun content(auth: JwtAuthenticationToken, @PathVariable entryId: UUID, @PathVariable assetId: UUID): ResponseEntity<ByteArray> {
        val content = media.content(auth.token.subject, entryId, assetId)
        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(Duration.ofMinutes(15)).cachePrivate().mustRevalidate())
            .header(HttpHeaders.VARY, HttpHeaders.AUTHORIZATION)
            .contentType(MediaType.parseMediaType(content.contentType))
            .body(content.bytes)
    }

    @GetMapping("/media/candidates/{assetId}/content")
    fun candidateContent(auth: JwtAuthenticationToken, @PathVariable assetId: UUID): ResponseEntity<ByteArray> {
        val content = media.candidateContent(auth.token.subject, auth.isMediaReviewer(), assetId)
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .header(HttpHeaders.VARY, HttpHeaders.AUTHORIZATION)
            .contentType(MediaType.parseMediaType(content.contentType))
            .body(content.bytes)
    }
}

private fun JwtAuthenticationToken.isMediaReviewer(): Boolean = authorities.any {
    it.authority in setOf("ROLE_TEACHER", "ROLE_ADMIN", "TEACHER", "ADMIN")
}
