package com.playsay.vocabulary.controller

import com.playsay.vocabulary.dto.*
import com.playsay.vocabulary.service.VocabularyPracticeService
import com.playsay.vocabulary.service.VocabularyService
import com.playsay.vocabulary.config.security.requireSubject
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/vocabulary")
class VocabularyController(
    private val vocabulary: VocabularyService,
    private val practice: VocabularyPracticeService,
) {
    @PostMapping("/translation-suggestions") fun suggest(auth: JwtAuthenticationToken, @Valid @RequestBody request: TranslationSuggestionRequest) = vocabulary.suggest(auth.token.requireSubject(), request)
    @PostMapping("/entries") @ResponseStatus(HttpStatus.CREATED) fun create(auth: JwtAuthenticationToken, @Valid @RequestBody request: CreateVocabularyEntryRequest) = vocabulary.create(auth.token.requireSubject(), request)
    @GetMapping("/entries") fun list(
        auth: JwtAuthenticationToken,
        @RequestParam(required = false) query: String?,
        @RequestParam(required = false) ownerSubject: String?,
        @RequestParam(required = false) lessonId: UUID?,
    ) = vocabulary.list(auth.token.requireSubject(), query, ownerSubject, lessonId)
    @GetMapping("/overview") fun overview(
        auth: JwtAuthenticationToken,
        @RequestParam(required = false) ownerSubject: String?,
        @RequestParam(required = false) lessonId: UUID?,
        @RequestParam(defaultValue = "5") limit: Int,
    ) = vocabulary.overview(auth.token.requireSubject(), ownerSubject, lessonId, limit)
    @PatchMapping("/entries/{id}") fun update(auth: JwtAuthenticationToken, @PathVariable id: UUID, @Valid @RequestBody request: UpdateVocabularyEntryRequest) = vocabulary.update(auth.token.requireSubject(), id, request)
    @DeleteMapping("/entries/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) fun archive(auth: JwtAuthenticationToken, @PathVariable id: UUID) = vocabulary.archive(auth.token.requireSubject(), id)
    @GetMapping("/practice") fun practice(auth: JwtAuthenticationToken, @RequestParam(defaultValue = "32") limit: Int) =
        VocabularyEntryPracticeResponse(practice.legacyPractice(auth.token.requireSubject(), limit))
}
