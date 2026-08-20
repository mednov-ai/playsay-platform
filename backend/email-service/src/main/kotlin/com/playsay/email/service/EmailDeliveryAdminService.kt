package com.playsay.email.service

import com.playsay.contract.email.model.EmailDeliveryDetailResponse
import com.playsay.contract.email.model.EmailDeliveryPageResponse
import com.playsay.contract.email.model.EmailDeliveryResendResponse
import com.playsay.contract.email.model.EmailDeliverySummaryResponse
import com.playsay.contract.email.model.EmailProviderAttemptResponse
import com.playsay.email.entity.EmailDeliveryAttemptEntity
import com.playsay.email.entity.EmailProviderAttemptEntity
import com.playsay.email.repo.EmailDeliveryAttemptRepo
import com.playsay.email.repo.EmailProviderAttemptRepo
import jakarta.persistence.criteria.Predicate
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class EmailDeliveryAdminService(
    private val deliveries: EmailDeliveryAttemptRepo,
    private val providerAttempts: EmailProviderAttemptRepo,
    private val transactionalEmailService: TransactionalEmailService,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    fun list(
        page: Int,
        size: Int,
        search: String?,
        status: String?,
        providerStatus: String?,
        templateKey: String?,
        createdFrom: Instant?,
        createdTo: Instant?,
    ): EmailDeliveryPageResponse {
        val pageable = PageRequest.of(page.coerceAtLeast(0), size.coerceIn(1, 100), Sort.by(Sort.Direction.DESC, "createdAt", "id"))
        val result = deliveries.findAll(
            Specification { root, _, criteriaBuilder ->
                val predicates = mutableListOf<Predicate>()
                search?.trim()?.takeIf(String::isNotBlank)?.lowercase()?.let { query ->
                    val pattern = "%$query%"
                    predicates += criteriaBuilder.or(
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("toEmail")), pattern),
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("subject")), pattern),
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("idempotencyKey")), pattern),
                    )
                }
                status?.trim()?.takeIf(String::isNotBlank)?.let { value ->
                    predicates += criteriaBuilder.equal(root.get<String>("status"), value.uppercase())
                }
                providerStatus?.trim()?.takeIf(String::isNotBlank)?.let { value ->
                    predicates += criteriaBuilder.equal(root.get<String>("providerStatus"), value.uppercase())
                }
                templateKey?.trim()?.takeIf(String::isNotBlank)?.let { value ->
                    predicates += criteriaBuilder.equal(root.get<String>("templateKey"), value)
                }
                createdFrom?.let { value -> predicates += criteriaBuilder.greaterThanOrEqualTo(root.get("createdAt"), value) }
                createdTo?.let { value -> predicates += criteriaBuilder.lessThan(root.get("createdAt"), value) }
                criteriaBuilder.and(*predicates.toTypedArray())
            },
            pageable,
        )
        val now = Instant.now(clock)
        return EmailDeliveryPageResponse(
            items = result.content.map { delivery -> delivery.toSummary(now) },
            page = result.number,
            size = result.size,
            totalElements = result.totalElements,
            totalPages = result.totalPages,
        )
    }

    @Transactional(readOnly = true)
    fun detail(id: UUID): EmailDeliveryDetailResponse {
        val delivery = deliveries.findById(id).orElseThrow(::EmailDeliveryNotFoundException)
        return EmailDeliveryDetailResponse(
            delivery = delivery.toSummary(Instant.now(clock)),
            attempts = providerAttempts.findAllByEmailDeliveryIdOrderByAttemptNumberDesc(id).map { attempt -> attempt.toResponse() },
        )
    }

    fun resend(id: UUID): EmailDeliveryResendResponse = transactionalEmailService.resend(id).let { result ->
        EmailDeliveryResendResponse(
            deliveryAttemptId = result.deliveryAttemptId,
            status = result.status,
            provider = result.provider,
            providerStatus = result.providerStatus,
        )
    }

    private fun EmailDeliveryAttemptEntity.toSummary(now: Instant): EmailDeliverySummaryResponse = EmailDeliverySummaryResponse(
        id = id,
        toEmail = toEmail,
        templateKey = templateKey,
        locale = locale,
        subject = subject,
        status = status,
        provider = provider,
        providerStatus = providerStatus,
        providerDeliveryStatus = providerDeliveryStatus,
        providerDestinationResponse = providerDestinationResponse,
        providerAttemptCount = providerAttemptCount,
        providerEventAt = providerEventAt,
        providerCheckedAt = providerCheckedAt,
        providerTrackingUntil = providerTrackingUntil,
        resendAllowed = with(transactionalEmailService) { resendAllowed(now) },
        resendReason = with(transactionalEmailService) { resendReason(now) },
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

    private fun EmailProviderAttemptEntity.toResponse(): EmailProviderAttemptResponse = EmailProviderAttemptResponse(
        id = id,
        attemptNumber = attemptNumber,
        provider = provider,
        providerJobId = providerJobId,
        providerStatus = providerStatus,
        providerDeliveryStatus = providerDeliveryStatus,
        providerDestinationResponse = providerDestinationResponse,
        providerEventAt = providerEventAt,
        providerCheckedAt = providerCheckedAt,
        trackingUntil = trackingUntil,
        errorMessage = errorMessage,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
}
