package com.playsay.gateway.dto


data class LiveKitWebhookEvent(
    val event: String = "",
    val createdAt: Long? = null,
    val room: LiveKitWebhookRoom? = null,
    val participant: LiveKitWebhookParticipant? = null,
)

data class LiveKitWebhookRoom(
    val name: String? = null,
)

data class LiveKitWebhookParticipant(
    val identity: String? = null,
)
