package com.playsay.gateway.controller

import com.playsay.gateway.dto.ChatContactResponse
import com.playsay.gateway.dto.ChatConversationResponse
import com.playsay.gateway.dto.ChatMessagePageResponse
import com.playsay.gateway.dto.ChatMessageRequest
import com.playsay.gateway.dto.ChatMessageResponse
import com.playsay.gateway.dto.ChatReadReceiptResponse
import com.playsay.gateway.dto.CreateChatConversationRequest
import com.playsay.gateway.dto.MarkChatReadRequest
import com.playsay.gateway.dto.ChatPushCapabilityResponse
import com.playsay.gateway.dto.ChatPushSubscriptionRequest
import com.playsay.gateway.dto.ChatPushSubscriptionResponse
import com.playsay.gateway.dto.ChatPushUnsubscribeRequest
import com.playsay.gateway.service.ChatService
import com.playsay.gateway.service.ChatPushSubscriptionService
import jakarta.validation.Valid
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class ChatController(
    private val service: ChatService,
    private val pushSubscriptions: ChatPushSubscriptionService,
) {
    @GetMapping("/chat/contacts", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun contacts(authentication: JwtAuthenticationToken): List<ChatContactResponse> =
        service.contacts(authentication)

    @GetMapping("/chat/conversations", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun conversations(authentication: JwtAuthenticationToken): List<ChatConversationResponse> =
        service.conversations(authentication)

    @PostMapping(
        "/chat/conversations",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.CREATED)
    fun createConversation(
        authentication: JwtAuthenticationToken,
        @Valid @RequestBody request: CreateChatConversationRequest,
    ): ChatConversationResponse = service.createConversation(authentication, request.participantSubject)

    @GetMapping("/chat/conversations/{conversationId}/messages", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun messages(
        authentication: JwtAuthenticationToken,
        @PathVariable conversationId: UUID,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(defaultValue = "50") limit: Int,
    ): ChatMessagePageResponse = service.messages(authentication, conversationId, cursor, limit)

    @PostMapping(
        "/chat/conversations/{conversationId}/messages",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.CREATED)
    fun sendMessage(
        authentication: JwtAuthenticationToken,
        @PathVariable conversationId: UUID,
        @Valid @RequestBody request: ChatMessageRequest,
    ): ChatMessageResponse = service.sendMessage(authentication, conversationId, request)

    @PutMapping(
        "/chat/conversations/{conversationId}/read",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun markRead(
        authentication: JwtAuthenticationToken,
        @PathVariable conversationId: UUID,
        @Valid @RequestBody request: MarkChatReadRequest,
    ): ChatReadReceiptResponse = service.markRead(authentication, conversationId, request.lastReadMessageId)

    @GetMapping("/chat/push/capability", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun pushCapability(authentication: JwtAuthenticationToken): ChatPushCapabilityResponse =
        pushSubscriptions.capability(authentication)

    @PutMapping(
        "/chat/push/subscription",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun upsertPushSubscription(
        authentication: JwtAuthenticationToken,
        @Valid @RequestBody request: ChatPushSubscriptionRequest,
    ): ChatPushSubscriptionResponse = pushSubscriptions.upsert(authentication, request)

    @DeleteMapping(
        "/chat/push/subscription",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun removePushSubscription(
        authentication: JwtAuthenticationToken,
        @Valid @RequestBody request: ChatPushUnsubscribeRequest,
    ): ChatPushSubscriptionResponse = pushSubscriptions.remove(authentication, request.endpoint)
}
