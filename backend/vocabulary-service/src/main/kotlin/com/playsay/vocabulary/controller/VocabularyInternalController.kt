package com.playsay.vocabulary.controller

import com.playsay.vocabulary.dto.VocabularyHomeworkPreparationRequest
import com.playsay.vocabulary.dto.VocabularyHomeworkPreparationResponse
import com.playsay.vocabulary.dto.VocabularyKeyResultRequest
import com.playsay.vocabulary.service.VocabularyPracticeService
import com.playsay.vocabulary.service.VocabularyDiagnosticsService
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.ResponseStatus
import java.util.UUID
import org.springframework.web.server.ResponseStatusException
import jakarta.validation.Valid

@RestController
class VocabularyInternalController(
    private val practices: VocabularyPracticeService,
    private val diagnostics: VocabularyDiagnosticsService,
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
) {
    @PostMapping("/internal/vocabulary/assignments")
    fun prepareAssignment(
        @RequestHeader("X-PlaySay-Service-Token", required = false) presentedToken: String?,
        @Valid @RequestBody request: VocabularyHomeworkPreparationRequest,
    ): VocabularyHomeworkPreparationResponse {
        requireServiceToken(presentedToken)
        return practices.prepareHomework(request)
    }

    @PostMapping("/internal/vocabulary/practice-sessions/{sessionId}/key-results")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun recordKeyResult(
        @PathVariable sessionId: UUID,
        @RequestHeader("X-PlaySay-Service-Token", required = false) presentedToken: String?,
        @Valid @RequestBody request: VocabularyKeyResultRequest,
    ) {
        requireServiceToken(presentedToken)
        practices.recordKeyResult(sessionId, request)
    }

    @GetMapping("/internal/vocabulary/diagnostics")
    fun diagnostics(
        @RequestHeader("X-PlaySay-Service-Token", required = false) presentedToken: String?,
    ) = run {
        requireServiceToken(presentedToken)
        diagnostics.inspect()
    }

    @PostMapping("/internal/vocabulary/reconcile")
    fun reconcile(
        @RequestHeader("X-PlaySay-Service-Token", required = false) presentedToken: String?,
    ) = diagnostics.run {
        requireServiceToken(presentedToken)
        reconcile()
        inspect()
    }

    private fun requireServiceToken(presentedToken: String?) {
        if (serviceToken.isBlank() || presentedToken != serviceToken) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
    }
}
