package com.playsay.keyboard.controller

import com.playsay.keyboard.dto.ProgressResponse
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.dto.TrainingResultResponse
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
    ): TrainingResultResponse =
        trainingService.submit(authentication.token.subject, request)

    @GetMapping("/progress")
    fun progress(authentication: JwtAuthenticationToken): ProgressResponse =
        trainingService.progress(authentication.token.subject)
}
