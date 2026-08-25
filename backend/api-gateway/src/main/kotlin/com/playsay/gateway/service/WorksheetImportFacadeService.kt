package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.playsay.gateway.client.WorksheetImportClientContent
import com.playsay.gateway.client.WorksheetImportInternalClient
import com.playsay.gateway.dto.WorksheetImportCreateRequest
import com.playsay.gateway.config.WorksheetImportGatewayProperties
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.http.HttpStatus
import org.springframework.web.multipart.MultipartFile

@Service
class WorksheetImportFacadeService(
    private val client: WorksheetImportInternalClient,
    private val properties: WorksheetImportGatewayProperties,
) {
    fun create(authentication: JwtAuthenticationToken, request: WorksheetImportCreateRequest, files: List<MultipartFile>): JsonNode {
        val oversized = files.isEmpty() || files.any { it.size <= 0 || it.size > properties.maxFileBytes }
        val packetBytes = files.fold(0L) { total, file -> if (Long.MAX_VALUE - total < file.size) Long.MAX_VALUE else total + file.size }
        if (oversized || packetBytes > properties.maxRequestBytes) {
            throw ProjectResponseException.localized(HttpStatus.PAYLOAD_TOO_LARGE, MetaData.ErrorCodes.WORKSHEET_IMPORT_REQUEST_FAILED)
        }
        return client.create(request, files, bearer(authentication))
    }

    fun get(authentication: JwtAuthenticationToken, sessionId: UUID): JsonNode = client.get(sessionId, bearer(authentication))

    fun cancel(authentication: JwtAuthenticationToken, sessionId: UUID) = client.cancel(sessionId, bearer(authentication))

    fun preview(authentication: JwtAuthenticationToken, sessionId: UUID, pageId: UUID): WorksheetImportClientContent =
        client.preview(sessionId, pageId, bearer(authentication))

    fun replaceReview(authentication: JwtAuthenticationToken, sessionId: UUID, revision: Long, review: JsonNode): JsonNode =
        client.replaceReview(sessionId, revision, review, bearer(authentication))

    fun continueManually(authentication: JwtAuthenticationToken, sessionId: UUID): JsonNode =
        client.continueManually(sessionId, bearer(authentication))

    fun retryAnalysis(authentication: JwtAuthenticationToken, sessionId: UUID): JsonNode =
        client.retryAnalysis(sessionId, bearer(authentication))

    private fun bearer(authentication: JwtAuthenticationToken) = authentication.token.tokenValue
}
