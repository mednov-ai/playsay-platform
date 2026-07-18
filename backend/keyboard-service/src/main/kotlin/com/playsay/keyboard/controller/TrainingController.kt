package com.playsay.keyboard.controller

import com.playsay.keyboard.dto.ClaimAnonymousProgressRequest
import com.playsay.keyboard.dto.ClaimAnonymousProgressResponse
import com.playsay.keyboard.dto.ProgressResponse
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.dto.SubmitTrainingResultResponse
import com.playsay.keyboard.service.TrainingService
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.Locale

@RestController
@RequestMapping("/api/training")
class TrainingController(
    private val trainingService: TrainingService,
) {
    @PostMapping("/results")
    @ResponseStatus(HttpStatus.CREATED)
    fun submit(
        authentication: JwtAuthenticationToken,
        @Valid @RequestBody request: SubmitResultRequest,
        locale: Locale = Locale.forLanguageTag("ru"),
    ): SubmitTrainingResultResponse =
        trainingService.submit(authentication.token.subject, request, locale)

    @GetMapping("/progress")
    fun progress(authentication: JwtAuthenticationToken): ProgressResponse =
        trainingService.progress(authentication.token.subject)

    @PostMapping("/claim-anonymous")
    fun claimAnonymous(
        authentication: JwtAuthenticationToken,
        @Valid @RequestBody request: ClaimAnonymousProgressRequest,
    ): ClaimAnonymousProgressResponse =
        trainingService.claimAnonymous(authentication.token.subject, request)
}
