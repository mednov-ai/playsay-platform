package com.playsay.keyboard.controller

import com.playsay.keyboard.service.KeyboardVocabularyDiagnostics
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
class KeyboardVocabularyDiagnosticsController(
    private val diagnostics: KeyboardVocabularyDiagnostics,
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
) {
    @GetMapping("/internal/keyboard/vocabulary/diagnostics")
    fun inspect(@RequestHeader("X-PlaySay-Service-Token", required = false) token: String?) = run {
        requireServiceToken(token)
        diagnostics.inspect()
    }

    @PostMapping("/internal/keyboard/vocabulary/reconcile")
    fun reconcile(@RequestHeader("X-PlaySay-Service-Token", required = false) token: String?) = run {
        requireServiceToken(token)
        diagnostics.reconcile()
    }

    private fun requireServiceToken(token: String?) {
        if (serviceToken.isBlank() || token != serviceToken) throw ResponseStatusException(HttpStatus.FORBIDDEN)
    }
}
