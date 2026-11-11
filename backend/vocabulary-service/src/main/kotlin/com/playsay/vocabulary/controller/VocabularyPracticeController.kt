package com.playsay.vocabulary.controller

import com.playsay.vocabulary.dto.VocabularyAttemptRequest
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.dto.VocabularyPracticeStatusRequest
import com.playsay.vocabulary.dto.VocabularyActivePracticeResponse
import com.playsay.vocabulary.dto.VocabularyKeyAcknowledgementRequest
import com.playsay.vocabulary.dto.VocabularyKeyTargetResultRequest
import com.playsay.vocabulary.dto.VocabularySelectionRecipeRequest
import com.playsay.vocabulary.service.VocabularyPracticeService
import com.playsay.vocabulary.config.security.requireSubject
import jakarta.validation.Valid
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/vocabulary")
class VocabularyPracticeController(
    private val practice: VocabularyPracticeService,
) {
    @GetMapping("/learners")
    fun learners(
        auth: JwtAuthenticationToken,
        @RequestParam(required = false) query: String?,
    ) = practice.learners(auth.token.requireSubject(), query)

    @GetMapping("/dashboard")
    fun dashboard(
        auth: JwtAuthenticationToken,
        @RequestParam(required = false) ownerSubject: String?,
        @RequestParam(required = false) lessonId: UUID?,
        @RequestParam(required = false) query: String?,
    ) = practice.dashboard(auth.token.requireSubject(), ownerSubject, lessonId, query)

    @PostMapping("/practices/preview")
    fun preview(
        auth: JwtAuthenticationToken,
        @Valid @RequestBody request: VocabularyPracticeSettingsRequest,
    ) = practice.preview(auth.token.requireSubject(), request)

    @PostMapping("/practices/recommended-preview")
    fun recommendedPreview(
        auth: JwtAuthenticationToken,
        @Valid @RequestBody request: VocabularyPracticeSettingsRequest,
    ) = practice.recommendedPreview(auth.token.requireSubject(), request)

    @GetMapping("/selection-recipes")
    fun recipes(auth: JwtAuthenticationToken) = practice.recipes(auth.token.requireSubject())

    @GetMapping("/selection-recipes/{recipeId}")
    fun recipe(auth: JwtAuthenticationToken, @PathVariable recipeId: UUID) = practice.recipe(auth.token.requireSubject(), recipeId)

    @PostMapping("/selection-recipes")
    @ResponseStatus(HttpStatus.CREATED)
    fun createRecipe(
        auth: JwtAuthenticationToken,
        @Valid @RequestBody request: VocabularySelectionRecipeRequest,
    ) = practice.createRecipe(auth.token.requireSubject(), request)

    @PutMapping("/selection-recipes/{recipeId}")
    fun updateRecipe(
        auth: JwtAuthenticationToken,
        @PathVariable recipeId: UUID,
        @Valid @RequestBody request: VocabularySelectionRecipeRequest,
    ) = practice.updateRecipe(auth.token.requireSubject(), recipeId, request)

    @DeleteMapping("/selection-recipes/{recipeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteRecipe(auth: JwtAuthenticationToken, @PathVariable recipeId: UUID) =
        practice.deleteRecipe(auth.token.requireSubject(), recipeId)

    @PostMapping("/practices")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        auth: JwtAuthenticationToken,
        @Valid @RequestBody request: VocabularyPracticeSettingsRequest,
    ) = practice.createLive(auth.token.requireSubject(), request)

    @PostMapping("/practices/self")
    fun self(
        auth: JwtAuthenticationToken,
        @Valid @RequestBody request: VocabularyPracticeSettingsRequest,
    ) = practice.selfPractice(auth.token.requireSubject(), request)

    @GetMapping("/practices/active")
    fun active(
        auth: JwtAuthenticationToken,
        @RequestParam lessonId: UUID,
    ) = VocabularyActivePracticeResponse(practice.activeForLesson(auth.token.requireSubject(), lessonId))

    @PatchMapping("/practices/{practiceId}/status")
    fun status(
        auth: JwtAuthenticationToken,
        @PathVariable practiceId: UUID,
        @RequestBody request: VocabularyPracticeStatusRequest,
    ) = practice.status(auth.token.requireSubject(), practiceId, request)

    @GetMapping("/practice-sessions")
    fun history(
        auth: JwtAuthenticationToken,
        @RequestParam(required = false) ownerSubject: String?,
        @RequestParam(required = false) lessonId: UUID?,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "25") size: Int,
    ) = practice.history(auth.token.requireSubject(), ownerSubject, lessonId, page, size)

    @GetMapping("/practice-sessions/{sessionId}")
    fun session(
        auth: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
    ) = practice.session(auth.token.requireSubject(), sessionId)

    @PostMapping("/practice-sessions/{sessionId}/attempts")
    @ResponseStatus(HttpStatus.CREATED)
    fun attempt(
        auth: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
        @Valid @RequestBody request: VocabularyAttemptRequest,
    ) = practice.attempt(auth.token.requireSubject(), sessionId, request)

    @PostMapping("/practice-sessions/{sessionId}/items/{itemId}/reveal")
    fun reveal(
        auth: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
        @PathVariable itemId: UUID,
    ) = practice.reveal(auth.token.requireSubject(), sessionId, itemId)

    @PostMapping("/practice-sessions/{sessionId}/hint")
    fun giveHint(
        auth: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
    ) = practice.giveHint(auth.token.requireSubject(), sessionId)

    @PostMapping("/practice-sessions/{sessionId}/help-request")
    fun requestHelp(
        auth: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
    ) = practice.requestHelp(auth.token.requireSubject(), sessionId)

    @GetMapping("/practice-sessions/{sessionId}/key-set")
    fun keySet(
        auth: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
    ) = practice.keySet(auth.token.requireSubject(), sessionId)

    @PostMapping("/practice-sessions/{sessionId}/key-target-results")
    fun recordKeyTarget(
        auth: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
        @Valid @RequestBody request: VocabularyKeyTargetResultRequest,
    ) = practice.recordOwnedKeyTarget(auth.token.requireSubject(), sessionId, request)

    @PatchMapping("/practice-sessions/{sessionId}/key-acknowledgement")
    fun acknowledgeKeyPosition(
        auth: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
        @Valid @RequestBody request: VocabularyKeyAcknowledgementRequest,
    ) = practice.acknowledgeKeyPosition(auth.token.requireSubject(), sessionId, request)
}
