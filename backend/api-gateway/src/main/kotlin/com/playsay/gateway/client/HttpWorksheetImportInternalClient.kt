package com.playsay.gateway.client

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.contract.worksheetimport.model.MaterializationAcknowledgementRequest
import com.playsay.contract.worksheetimport.model.WorksheetMaterializationBundle
import com.playsay.contract.worksheetimport.model.WorksheetMaterializationRequest
import com.playsay.gateway.config.WorksheetImportGatewayProperties
import com.playsay.gateway.dto.WorksheetImportCreateRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.core.io.InputStreamResource
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpEntity
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.util.LinkedMultiValueMap
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import org.springframework.web.multipart.MultipartFile
import org.slf4j.LoggerFactory

@Component
class HttpWorksheetImportInternalClient(
    private val properties: WorksheetImportGatewayProperties,
    private val objectMapper: ObjectMapper,
) : WorksheetImportInternalClient {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val client: RestClient by lazy {
        val factory = SimpleClientHttpRequestFactory().apply {
            setConnectTimeout(properties.connectTimeout)
            setReadTimeout(properties.requestTimeout)
        }
        RestClient.builder().baseUrl(properties.baseUrl.trimEnd('/')).requestFactory(factory).build()
    }

    override fun create(request: WorksheetImportCreateRequest, files: List<MultipartFile>, userBearerToken: String): JsonNode {
        requireEnabled()
        val body = LinkedMultiValueMap<String, Any>()
        body.add("metadata", HttpEntity(request, HttpHeaders().apply { contentType = MediaType.APPLICATION_JSON }))
        files.forEach { file ->
            body.add("files", object : InputStreamResource(file.inputStream) {
                override fun getFilename() = file.originalFilename ?: "source"
                override fun contentLength() = file.size
            })
        }
        return exchange {
            client.post().uri("/internal/worksheet-imports")
                .headers { headers(it, userBearerToken); it.contentType = MediaType.MULTIPART_FORM_DATA }
            .body(body).retrieve().body(String::class.java).let(::readJson)
        }
    }

    override fun get(sessionId: UUID, userBearerToken: String): JsonNode = exchange {
        client.get().uri("/internal/worksheet-imports/{id}", sessionId).headers { headers(it, userBearerToken) }
            .retrieve().body(String::class.java).let(::readJson)
    }

    override fun cancel(sessionId: UUID, userBearerToken: String) = exchange<Unit> {
        client.delete().uri("/internal/worksheet-imports/{id}", sessionId).headers { headers(it, userBearerToken) }.retrieve().toBodilessEntity(); Unit
    }

    override fun preview(sessionId: UUID, pageId: UUID, userBearerToken: String): WorksheetImportClientContent = exchange {
        val response = client.get().uri("/internal/worksheet-imports/{id}/pages/{pageId}/preview", sessionId, pageId)
            .headers { headers(it, userBearerToken) }.retrieve().toEntity(ByteArray::class.java)
        WorksheetImportClientContent(response.body ?: byteArrayOf(), response.headers.contentType?.toString() ?: "application/octet-stream")
    }

    override fun replaceReview(sessionId: UUID, revision: Long, review: JsonNode, userBearerToken: String): JsonNode = exchange {
        client.put().uri("/internal/worksheet-imports/{id}/review", sessionId)
            .headers { headers(it, userBearerToken); it.set("If-Match", revision.toString()) }
            .contentType(MediaType.APPLICATION_JSON).body(objectMapper.writeValueAsString(review))
            .retrieve().body(String::class.java).let(::readJson)
    }

    override fun continueManually(sessionId: UUID, userBearerToken: String): JsonNode = exchange {
        client.post().uri("/internal/worksheet-imports/{id}/continue-manually", sessionId)
            .headers { headers(it, userBearerToken) }.retrieve().body(String::class.java).let(::readJson)
    }

    override fun retryAnalysis(sessionId: UUID, userBearerToken: String): JsonNode = exchange {
        client.post().uri("/internal/worksheet-imports/{id}/retry", sessionId)
            .headers { headers(it, userBearerToken) }.retrieve().body(String::class.java).let(::readJson)
    }

    override fun materializationBundle(sessionId: UUID, revision: Long, rightsConfirmed: Boolean, userBearerToken: String): WorksheetMaterializationBundle = exchange {
        client.post().uri("/internal/worksheet-imports/{id}/materialization-bundle", sessionId)
            .headers { headers(it, userBearerToken) }.contentType(MediaType.APPLICATION_JSON)
            .body(objectMapper.writeValueAsString(WorksheetMaterializationRequest(revision, rightsConfirmed)))
            .retrieve().body(String::class.java)
            .let { objectMapper.readValue(requireNotNull(it), WorksheetMaterializationBundle::class.java) }
    }

    override fun materializationAsset(sessionId: UUID, revision: Long, assetId: UUID, userBearerToken: String): ByteArray = exchange {
        client.get().uri("/internal/worksheet-imports/{id}/materialization-assets/{assetId}", sessionId, assetId)
            .headers { headers(it, userBearerToken) }.retrieve().body(ByteArray::class.java)!!
    }

    override fun acknowledgeMaterialization(sessionId: UUID, revision: Long, materialId: UUID, userBearerToken: String) = exchange<Unit> {
        client.post().uri("/internal/worksheet-imports/{id}/materialization-acknowledgement", sessionId)
            .headers { headers(it, userBearerToken) }.contentType(MediaType.APPLICATION_JSON)
            .body(objectMapper.writeValueAsString(MaterializationAcknowledgementRequest(revision, materialId)))
            .retrieve().toBodilessEntity(); Unit
    }

    private fun headers(headers: HttpHeaders, bearer: String) {
        requireEnabled()
        headers.setBearerAuth(bearer)
        headers.set("X-PlaySay-Worksheet-Service-Token", properties.serviceToken)
    }

    private fun readJson(body: String?): JsonNode = objectMapper.readTree(requireNotNull(body))

    private fun requireEnabled() {
        if (!properties.enabled || properties.serviceToken.isBlank()) {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.WORKSHEET_IMPORT_UNAVAILABLE)
        }
    }

    private fun <T> exchange(action: () -> T): T = try { action() } catch (error: RestClientResponseException) {
        logger.warn("worksheet import service rejected request status={}", error.statusCode.value())
        throw ProjectResponseException.localized(error.statusCode, MetaData.ErrorCodes.WORKSHEET_IMPORT_REQUEST_FAILED)
    } catch (error: ProjectResponseException) { throw error } catch (error: Exception) {
        logger.warn("worksheet import service request failed failure={}", error::class.simpleName)
        throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.WORKSHEET_IMPORT_UNAVAILABLE)
    }
}
