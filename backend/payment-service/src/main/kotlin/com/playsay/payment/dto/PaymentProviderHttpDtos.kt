package com.playsay.payment.dto

data class PaymentProviderHttpRequest(
    val method: String,
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: String? = null,
)

data class PaymentProviderHttpResponse(
    val statusCode: Int,
    val body: String,
)
