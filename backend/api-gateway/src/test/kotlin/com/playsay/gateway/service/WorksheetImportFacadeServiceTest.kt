package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.contract.worksheetimport.model.WorksheetMaterializationBundle
import com.playsay.gateway.client.WorksheetImportClientContent
import com.playsay.gateway.client.WorksheetImportInternalClient
import com.playsay.gateway.config.WorksheetImportGatewayProperties
import com.playsay.gateway.dto.WorksheetImportCreateRequest
import com.playsay.gateway.error.ProjectResponseException
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.multipart.MultipartFile

class WorksheetImportFacadeServiceTest {
    private val mapper = jacksonObjectMapper()

    @Test
    fun `forwards the user bearer token and never substitutes the service identity`() {
        val client = RecordingClient(mapper.createObjectNode().put("status", "ANALYZING"))
        val facade = WorksheetImportFacadeService(client, WorksheetImportGatewayProperties(maxFileBytes = 16, maxRequestBytes = 32))
        val file = MockMultipartFile("files", "page.png", "image/png", byteArrayOf(1, 2, 3))

        facade.create(authentication("user-jwt"), WorksheetImportCreateRequest("Unit", "en", "A1", "Synthetic"), listOf(file))

        assertEquals("user-jwt", client.lastBearer)
        assertEquals("page.png", client.lastFiles.single().originalFilename)
    }

    @Test
    fun `rejects an oversized packet before any cross-service request`() {
        val client = RecordingClient(mapper.createObjectNode())
        val facade = WorksheetImportFacadeService(client, WorksheetImportGatewayProperties(maxFileBytes = 4, maxRequestBytes = 6))
        val files = listOf(
            MockMultipartFile("files", "one.png", "image/png", byteArrayOf(1, 2, 3, 4)),
            MockMultipartFile("files", "two.png", "image/png", byteArrayOf(1, 2, 3, 4)),
        )

        assertFailsWith<ProjectResponseException> {
            facade.create(authentication("user-jwt"), WorksheetImportCreateRequest("Unit", "en", "A1", "Synthetic"), files)
        }
        assertEquals(0, client.createCalls)
    }

    @Test
    fun `retry preserves the same authenticated user context`() {
        val client = RecordingClient(mapper.createObjectNode().put("status", "ANALYZING"))
        val facade = WorksheetImportFacadeService(client, WorksheetImportGatewayProperties())

        facade.retryAnalysis(authentication("retry-jwt"), UUID.randomUUID())

        assertEquals("retry-jwt", client.lastBearer)
        assertEquals(1, client.retryCalls)
    }

    private fun authentication(token: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue(token).header("alg", "none").subject("teacher").issuedAt(Instant.EPOCH).expiresAt(Instant.MAX).build()
        return JwtAuthenticationToken(jwt)
    }

    private class RecordingClient(private val response: JsonNode) : WorksheetImportInternalClient {
        var createCalls = 0
        var retryCalls = 0
        var lastBearer: String? = null
        var lastFiles = emptyList<MultipartFile>()
        override fun create(request: WorksheetImportCreateRequest, files: List<MultipartFile>, userBearerToken: String): JsonNode = response.also {
            createCalls += 1; lastBearer = userBearerToken; lastFiles = files
        }
        override fun retryAnalysis(sessionId: UUID, userBearerToken: String): JsonNode = response.also { retryCalls += 1; lastBearer = userBearerToken }
        override fun get(sessionId: UUID, userBearerToken: String): JsonNode = unsupported()
        override fun cancel(sessionId: UUID, userBearerToken: String): Unit = unsupported()
        override fun preview(sessionId: UUID, pageId: UUID, userBearerToken: String): WorksheetImportClientContent = unsupported()
        override fun replaceReview(sessionId: UUID, revision: Long, review: JsonNode, userBearerToken: String): JsonNode = unsupported()
        override fun continueManually(sessionId: UUID, userBearerToken: String): JsonNode = unsupported()
        override fun materializationBundle(sessionId: UUID, revision: Long, rightsConfirmed: Boolean, userBearerToken: String): WorksheetMaterializationBundle = unsupported()
        override fun materializationAsset(sessionId: UUID, revision: Long, assetId: UUID, userBearerToken: String): ByteArray = unsupported()
        override fun acknowledgeMaterialization(sessionId: UUID, revision: Long, materialId: UUID, userBearerToken: String): Unit = unsupported()
        private fun unsupported(): Nothing = error("not used by this test")
    }
}
