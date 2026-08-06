package com.playsay.gateway

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.controller.PaymentController
import com.playsay.gateway.dto.PaymentCheckoutResponse
import com.playsay.gateway.dto.PaymentInvoiceCreateRequest
import com.playsay.gateway.dto.PaymentInvoiceCreatedResponse
import com.playsay.gateway.dto.PaymentInvoiceResponse
import com.playsay.gateway.dto.PaymentProviderEventResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.InternalPaymentInvoiceCreatePayload
import com.playsay.gateway.service.PaymentInvoiceFacade
import com.playsay.gateway.service.PaymentServiceClient
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.springframework.http.HttpStatus
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class PaymentControllerTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()

    @Test
    fun `teacher creates payment invoice with authenticated subject`() {
        val client = RecordingPaymentServiceClient()
        val controller = PaymentController(PaymentInvoiceFacade(client))

        val created = controller.createInvoice(
            authentication(subject = "teacher-1", role = "ROLE_TEACHER"),
            PaymentInvoiceCreateRequest(
                amountMinor = 350_000,
                currency = "RUB",
                description = "Honey School lesson package",
                studentUserId = null,
                payerName = "Parent",
                payerEmail = "parent@example.com",
                payerPhone = null,
                dueAt = null,
            ),
        )

        assertEquals("public-token", created.publicUrlToken)
        assertEquals("teacher-1", client.createdInvoices.single().createdBySubject)
        assertEquals(350_000, client.createdInvoices.single().amountMinor)
    }

    @Test
    fun `student cannot create payment invoice`() {
        val controller = PaymentController(PaymentInvoiceFacade(RecordingPaymentServiceClient()))

        val error = assertFailsWith<ProjectResponseException> {
            controller.createInvoice(
                authentication(subject = "student-1", role = "ROLE_STUDENT"),
                PaymentInvoiceCreateRequest(
                    amountMinor = 350_000,
                    currency = "RUB",
                    description = "Honey School lesson package",
                    studentUserId = null,
                    payerName = null,
                    payerEmail = null,
                    payerPhone = null,
                    dueAt = null,
                ),
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    @Test
    fun `public checkout does not require authentication`() {
        val client = RecordingPaymentServiceClient()
        val controller = PaymentController(PaymentInvoiceFacade(client))

        val checkout = controller.createPublicCheckout("public-token")

        assertEquals("https://checkout.test/pay-1", checkout.confirmationUrl)
        assertEquals("public-token", client.checkoutTokens.single())
    }

    @Test
    fun `public invoice hides internal identifiers and private contact fields`() {
        val controller = PaymentController(PaymentInvoiceFacade(RecordingPaymentServiceClient()))

        val responseJson = objectMapper.writeValueAsString(controller.publicInvoice("public-token"))

        assertTrue(responseJson.contains("PS-20260604-00001"))
        assertTrue(responseJson.contains("350000"))
        assertFalse(responseJson.contains("createdBySubject"))
        assertFalse(responseJson.contains("studentUserId"))
        assertFalse(responseJson.contains("payerEmail"))
        assertFalse(responseJson.contains("payerPhone"))
        assertFalse(responseJson.contains("teacher-1"))
    }

    private fun authentication(subject: String, role: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("token-$subject")
            .header("alg", "none")
            .subject(subject)
            .claim("preferred_username", subject)
            .build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(role)))
    }
}

private class RecordingPaymentServiceClient : PaymentServiceClient {
    val createdInvoices = mutableListOf<InternalPaymentInvoiceCreatePayload>()
    val checkoutTokens = mutableListOf<String>()

    override fun createInvoice(payload: InternalPaymentInvoiceCreatePayload): PaymentInvoiceCreatedResponse {
        createdInvoices += payload
        return PaymentInvoiceCreatedResponse(
            invoice = paymentInvoice(),
            publicUrlToken = "public-token",
        )
    }

    override fun listInvoices(): List<PaymentInvoiceResponse> = listOf(paymentInvoice())

    override fun adminInvoice(invoiceId: UUID) =
        com.playsay.gateway.dto.PaymentInvoiceDetailResponse(invoice = paymentInvoice(id = invoiceId), paymentAttempts = emptyList())

    override fun cancelInvoice(invoiceId: UUID): PaymentInvoiceResponse = paymentInvoice(id = invoiceId, status = "CANCELED")

    override fun publicInvoice(publicToken: String): PaymentInvoiceResponse = paymentInvoice()

    override fun createCheckout(publicToken: String): PaymentCheckoutResponse {
        checkoutTokens += publicToken
        return PaymentCheckoutResponse(
            invoiceId = UUID.randomUUID(),
            paymentAttemptId = UUID.randomUUID(),
            confirmationUrl = "https://checkout.test/pay-1",
        )
    }

    override fun processYooKassaWebhook(rawBody: String): PaymentProviderEventResponse =
        PaymentProviderEventResponse(
            id = UUID.randomUUID(),
            provider = "YOOKASSA",
            eventType = "payment.succeeded",
            providerPaymentId = "pay-1",
            status = "PROCESSED",
            receivedAt = Instant.EPOCH,
            processedAt = Instant.EPOCH,
        )

    private fun paymentInvoice(id: UUID = UUID.randomUUID(), status: String = "OPEN"): PaymentInvoiceResponse =
        PaymentInvoiceResponse(
            id = id,
            number = "PS-20260604-00001",
            status = status,
            amountMinor = 350_000,
            currency = "RUB",
            description = "Honey School lesson package",
            studentUserId = null,
            payerName = "Parent",
            payerEmail = "parent@example.com",
            payerPhone = null,
            createdBySubject = "teacher-1",
            dueAt = null,
            paidAt = null,
            canceledAt = null,
            createdAt = Instant.EPOCH,
            updatedAt = Instant.EPOCH,
        )
}
