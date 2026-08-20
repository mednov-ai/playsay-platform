package com.playsay.keyboard.service

import com.playsay.keyboard.dto.AnonymousProfileResponse
import com.playsay.keyboard.dto.ClaimAnonymousProgressRequest
import com.playsay.keyboard.dto.ClaimAnonymousProgressResponse
import com.playsay.keyboard.dto.ProgressResponse
import com.playsay.keyboard.dto.ResolveAnonymousProfileRequest
import com.playsay.keyboard.dto.ResetAnonymousProfileRequest
import com.playsay.keyboard.dto.SubmitAnonymousResultRequest
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.dto.SubmitTrainingResultResponse
import com.playsay.keyboard.dto.UpdateAnonymousProfileRequest
import jakarta.servlet.http.HttpServletRequest
import java.util.Locale
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class TrainingService(
    private val authenticatedSubmissionService: AuthenticatedTrainingSubmissionService,
    private val anonymousProfileService: AnonymousProfileService,
    private val anonymousSubmissionService: AnonymousTrainingSubmissionService,
    private val anonymousProgressClaimService: AnonymousProgressClaimService,
    private val progressService: TrainingProgressService,
    private val responseService: TrainingSubmissionResponseService,
) {
    @Transactional
    fun submit(
        subject: String,
        request: SubmitResultRequest,
        locale: Locale = Locale.forLanguageTag("ru"),
    ): SubmitTrainingResultResponse {
        val submission = authenticatedSubmissionService.submit(subject, request)
        return responseService.response(
            submission.saved,
            subject,
            null,
            submission.events,
            submission.chordSet,
            submission.recent,
            locale,
        )
    }

    @Transactional
    fun resolveAnonymousProfile(
        request: ResolveAnonymousProfileRequest,
        servletRequest: HttpServletRequest,
    ): AnonymousProfileResponse = anonymousProfileService.resolve(request.deviceId, servletRequest)

    @Transactional
    fun updateAnonymousProfile(
        request: UpdateAnonymousProfileRequest,
        servletRequest: HttpServletRequest,
    ): AnonymousProfileResponse = anonymousProfileService.update(request.deviceId, request.displayName, servletRequest)

    @Transactional
    fun resetAnonymousProfile(request: ResetAnonymousProfileRequest) {
        anonymousProfileService.reset(request.deviceId)
    }

    @Transactional
    fun submitAnonymous(
        request: SubmitAnonymousResultRequest,
        servletRequest: HttpServletRequest,
        locale: Locale = Locale.forLanguageTag("ru"),
    ): SubmitTrainingResultResponse {
        val submission = anonymousSubmissionService.submit(request, servletRequest)
        return responseService.response(
            submission.saved,
            null,
            submission.profileId,
            submission.events,
            submission.chordSet,
            submission.recent,
            locale,
        )
    }

    @Transactional
    fun claimAnonymous(subject: String, request: ClaimAnonymousProgressRequest): ClaimAnonymousProgressResponse =
        anonymousProgressClaimService.claim(subject, request.deviceId)

    @Transactional(readOnly = true)
    fun progress(subject: String): ProgressResponse = progressService.authenticated(subject)
}
