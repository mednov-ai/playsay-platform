package com.playsay.gateway.controller

import com.playsay.gateway.dto.VocabularyAssignmentProgressUpdateRequest
import com.playsay.gateway.service.VocabularyAssignmentProgressService
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class VocabularyAssignmentInternalController(
    private val progress: VocabularyAssignmentProgressService,
) {
    @PostMapping("/internal/vocabulary/assignments/{assignmentId}/progress")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun updateProgress(
        @PathVariable assignmentId: UUID,
        @RequestHeader("X-PlaySay-Service-Token", required = false) presentedToken: String?,
        @RequestBody request: VocabularyAssignmentProgressUpdateRequest,
    ) {
        progress.update(assignmentId, presentedToken, request)
    }
}
