package com.playsay.vocabulary.controller

import com.playsay.vocabulary.dto.*
import com.playsay.vocabulary.service.VocabularyService
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/vocabulary")
class VocabularyController(private val vocabulary: VocabularyService) {
    @PostMapping("/translation-suggestions") fun suggest(auth: JwtAuthenticationToken, @Valid @RequestBody request: TranslationSuggestionRequest) = vocabulary.suggest(auth.token.subject, request)
    @PostMapping("/entries") @ResponseStatus(HttpStatus.CREATED) fun create(auth: JwtAuthenticationToken, @Valid @RequestBody request: CreateVocabularyEntryRequest) = vocabulary.create(auth.token.subject, request)
    @GetMapping("/entries") fun list(auth: JwtAuthenticationToken, @RequestParam(required = false) query: String?) = vocabulary.list(auth.token.subject, query)
    @PatchMapping("/entries/{id}") fun update(auth: JwtAuthenticationToken, @PathVariable id: UUID, @Valid @RequestBody request: UpdateVocabularyEntryRequest) = vocabulary.update(auth.token.subject, id, request)
    @DeleteMapping("/entries/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) fun archive(auth: JwtAuthenticationToken, @PathVariable id: UUID) = vocabulary.archive(auth.token.subject, id)
    @GetMapping("/practice") fun practice(auth: JwtAuthenticationToken, @RequestParam(defaultValue = "32") limit: Int) = vocabulary.practice(auth.token.subject, limit)
}
