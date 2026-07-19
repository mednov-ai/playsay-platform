package com.playsay.gateway.dto

import java.time.Instant
import java.util.UUID

data class EmailServiceResponse(
    val status: Int,
    val body: String,
)

data class EmailDeliveryPageResponse(
    val items: List<EmailDeliverySummaryResponse>,
    val page: Int,
    val size: Int,
    val totalElements: Long,
    val totalPages: Int,
)

data class EmailDeliverySummaryResponse(
    val id: UUID,
    val toEmail: String,
    val templateKey: String,
    val locale: String,
    val subject: String?,
    val status: String,
    val provider: String?,
    val providerStatus: String?,
    val providerDeliveryStatus: String?,
    val providerDestinationResponse: String?,
    val providerAttemptCount: Int,
    val providerEventAt: Instant?,
    val providerCheckedAt: Instant?,
    val providerTrackingUntil: Instant?,
    val resendAllowed: Boolean,
    val resendReason: String,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class EmailDeliveryDetailResponse(
    val delivery: EmailDeliverySummaryResponse,
    val attempts: List<EmailProviderAttemptResponse>,
)

data class EmailProviderAttemptResponse(
    val id: UUID,
    val attemptNumber: Int,
    val provider: String,
    val providerJobId: String?,
    val providerStatus: String,
    val providerDeliveryStatus: String?,
    val providerDestinationResponse: String?,
    val providerEventAt: Instant?,
    val providerCheckedAt: Instant?,
    val trackingUntil: Instant?,
    val errorMessage: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class EmailDeliveryResendResponse(
    val deliveryAttemptId: UUID,
    val status: String,
    val provider: String?,
    val providerStatus: String?,
)

data class EmailDeliveryQuery(
    val page: Int,
    val size: Int,
    val search: String?,
    val status: String?,
    val providerStatus: String?,
    val templateKey: String?,
    val createdFrom: Instant?,
    val createdTo: Instant?,
)
