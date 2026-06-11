package com.playsay.keyboard.controller

import com.playsay.keyboard.dto.AnonymousProfileResponse
import com.playsay.keyboard.dto.ResolveAnonymousProfileRequest
import com.playsay.keyboard.dto.SubmitAnonymousResultRequest
import com.playsay.keyboard.dto.SubmitTrainingResultResponse
import com.playsay.keyboard.dto.UpdateAnonymousProfileRequest
import com.playsay.keyboard.service.TrainingService
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/anonymous")
class AnonymousController(
    private val trainingService: TrainingService,
) {
    @PostMapping("/profile/resolve")
    fun resolve(
        @RequestBody request: ResolveAnonymousProfileRequest,
        servletRequest: HttpServletRequest,
    ): AnonymousProfileResponse =
        trainingService.resolveAnonymousProfile(request, servletRequest)

    @PutMapping("/profile")
    fun update(
        @RequestBody request: UpdateAnonymousProfileRequest,
        servletRequest: HttpServletRequest,
    ): AnonymousProfileResponse =
        trainingService.updateAnonymousProfile(request, servletRequest)

    @PostMapping("/training/results")
    @ResponseStatus(HttpStatus.CREATED)
    fun submit(
        @Valid @RequestBody request: SubmitAnonymousResultRequest,
        servletRequest: HttpServletRequest,
    ): SubmitTrainingResultResponse =
        trainingService.submitAnonymous(request, servletRequest)
}
