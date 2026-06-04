package com.playsay.payment.repo

import com.playsay.payment.entity.PaymentAttemptEntity
import com.playsay.payment.entity.PaymentInvoiceEntity
import com.playsay.payment.entity.PaymentProviderEventEntity
import com.playsay.payment.service.PaymentAttemptStatus
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface PaymentInvoiceRepository : JpaRepository<PaymentInvoiceEntity, UUID> {
    fun findByPublicTokenHash(publicTokenHash: String): PaymentInvoiceEntity?
    fun findAllByOrderByCreatedAtDesc(): List<PaymentInvoiceEntity>
}

interface PaymentAttemptRepository : JpaRepository<PaymentAttemptEntity, UUID> {
    fun findByInvoiceIdOrderByCreatedAtAsc(invoiceId: UUID): List<PaymentAttemptEntity>
    fun findFirstByInvoiceIdAndStatusAndConfirmationUrlIsNotNullOrderByCreatedAtDesc(
        invoiceId: UUID,
        status: PaymentAttemptStatus,
    ): PaymentAttemptEntity?
}

interface PaymentProviderEventRepository : JpaRepository<PaymentProviderEventEntity, UUID> {
    fun findByBodySha256(bodySha256: String): PaymentProviderEventEntity?
}
