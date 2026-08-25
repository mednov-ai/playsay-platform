package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.contract.worksheetimport.model.WorksheetMaterializationAsset
import com.playsay.contract.worksheetimport.model.WorksheetMaterializationBundle
import com.playsay.gateway.client.WorksheetImportInternalClient
import java.security.MessageDigest
import java.time.Instant
import java.util.HexFormat
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.doNothing
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.multipart.MultipartFile
import com.playsay.gateway.client.WorksheetImportClientContent
import com.playsay.gateway.dto.WorksheetImportCreateRequest

class WorksheetMaterializationServiceTest {
    private val mapper = jacksonObjectMapper()

    @Test
    fun `lost acknowledgement response and retry produce one private draft without duplicate copies`() {
        val sessionId = UUID.randomUUID()
        val bytes = "raster".toByteArray()
        val asset = WorksheetMaterializationAsset(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 1, "private", "page.png", "image/png",
            bytes.size.toLong(), HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)), true,
        )
        val bundle = bundle(sessionId, asset)
        val client = FakeClient(bundle, bytes)
        val persistence = FakePersistence()
        val storage = InMemoryMaterialObjectStorage()
        val catalog = mock(LessonMaterialCatalogService::class.java)
        val authentication = auth("teacher")
        doNothing().`when`(catalog).requireMaterialManager(authentication)
        `when`(catalog.currentUserId(authentication)).thenReturn(UUID.randomUUID())
        val service = WorksheetMaterializationService(client, persistence, storage, catalog, WorksheetMaterialDocumentValidator(), mapper)

        val first = service.materialize(authentication, sessionId, 4, true)
        val retry = service.materialize(authentication, sessionId, 4, true)

        assertEquals(first, retry)
        assertEquals(1, client.bundleCalls)
        assertEquals(2, client.ackCalls)
        assertEquals(1, persistence.persistCalls)
        assertTrue(storage.getObject("material-assets/$first/${asset.id}.png").bytes.contentEquals(bytes))
        assertEquals("PRIVATE", persistence.visibility)
        assertEquals("DRAFT", persistence.status)
    }

    private fun bundle(sessionId: UUID, asset: WorksheetMaterializationAsset) = WorksheetMaterializationBundle(
        WorksheetMaterializationBundle.Version.worksheetMinusMaterializationSlashV1,
        sessionId, 4, "teacher", "Worksheet", "en", "A1",
        mapOf("schemaVersion" to 2, "pages" to listOf(mapOf("id" to "p1", "title" to "Page", "layout" to "STATIC_IMAGE", "blocks" to emptyList<Any>()))),
        mapOf("kind" to "WORKSHEET_PHOTO_IMPORT", "rightsConfirmed" to true), listOf(asset),
    )

    private fun auth(subject: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("bearer").header("alg", "none").subject(subject).issuedAt(Instant.EPOCH).expiresAt(Instant.MAX).build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority("ROLE_TEACHER")))
    }

    private class FakeClient(private val bundle: WorksheetMaterializationBundle, private val bytes: ByteArray) : WorksheetImportInternalClient {
        var bundleCalls = 0; var ackCalls = 0
        override fun create(request: WorksheetImportCreateRequest, files: List<MultipartFile>, userBearerToken: String): JsonNode = unsupported()
        override fun get(sessionId: UUID, userBearerToken: String): JsonNode = unsupported()
        override fun cancel(sessionId: UUID, userBearerToken: String): Unit = unsupported()
        override fun preview(sessionId: UUID, pageId: UUID, userBearerToken: String): WorksheetImportClientContent = unsupported()
        override fun replaceReview(sessionId: UUID, revision: Long, review: JsonNode, userBearerToken: String): JsonNode = unsupported()
        override fun continueManually(sessionId: UUID, userBearerToken: String): JsonNode = unsupported()
        override fun retryAnalysis(sessionId: UUID, userBearerToken: String): JsonNode = unsupported()
        override fun materializationBundle(sessionId: UUID, revision: Long, rightsConfirmed: Boolean, userBearerToken: String) = bundle.also { bundleCalls++ }
        override fun materializationAsset(sessionId: UUID, revision: Long, assetId: UUID, userBearerToken: String) = bytes
        override fun acknowledgeMaterialization(sessionId: UUID, revision: Long, materialId: UUID, userBearerToken: String) { ackCalls++; if (ackCalls == 1) error("lost response") }
        private fun unsupported(): Nothing = error("not used by this test")
    }

    private class FakePersistence : WorksheetMaterializationPersistence {
        var materialId: UUID? = null; var persistCalls = 0; var visibility = ""; var status = ""
        override fun existingMaterialId(sessionId: UUID) = materialId
        override fun persist(bundle: WorksheetMaterializationBundle, ownerUserId: UUID, document: JsonNode, sourceMeta: JsonNode, assets: List<WorksheetFetchedAsset>): UUID {
            persistCalls++
            visibility = "PRIVATE"; status = "DRAFT"
            return UUID.nameUUIDFromBytes("worksheet-material:${bundle.sessionId}".toByteArray()).also { materialId = it }
        }
    }
}
