package com.playsay.gateway.client

import com.playsay.gateway.config.ChatPushProperties
import java.nio.charset.StandardCharsets
import java.security.Security
import nl.martijndwars.webpush.Notification
import nl.martijndwars.webpush.PushService
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.springframework.stereotype.Component

data class ChatWebPushCommand(
    val endpoint: String,
    val p256dh: String,
    val auth: String,
    val payload: String,
)

sealed interface ChatWebPushResult {
    data object Success : ChatWebPushResult
    data class PermanentFailure(val status: Int) : ChatWebPushResult
    data class RetryableFailure(val errorClass: String) : ChatWebPushResult
}

interface ChatWebPushClient {
    fun send(command: ChatWebPushCommand): ChatWebPushResult
}

@Component
class VapidChatWebPushClient(
    private val properties: ChatPushProperties,
) : ChatWebPushClient {
    private val pushService: PushService? by lazy {
        if (!properties.enabled) return@lazy null
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(BouncyCastleProvider())
        }
        PushService(properties.publicKey, properties.privateKey, properties.subject)
    }

    override fun send(command: ChatWebPushCommand): ChatWebPushResult {
        val service = pushService ?: return ChatWebPushResult.RetryableFailure("PushDisabled")
        return try {
            val response = service.send(
                Notification(
                    command.endpoint,
                    command.p256dh,
                    command.auth,
                    command.payload.toByteArray(StandardCharsets.UTF_8),
                ),
            )
            when (val status = response.statusLine.statusCode) {
                in 200..299 -> ChatWebPushResult.Success
                404, 410 -> ChatWebPushResult.PermanentFailure(status)
                else -> ChatWebPushResult.RetryableFailure("Http$status")
            }
        } catch (exception: Exception) {
            ChatWebPushResult.RetryableFailure(exception::class.simpleName ?: "PushException")
        }
    }
}
