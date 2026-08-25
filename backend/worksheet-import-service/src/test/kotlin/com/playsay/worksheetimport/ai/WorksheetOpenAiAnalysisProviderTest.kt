package com.playsay.worksheetimport.ai

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.openai.OpenAiResponsesTransport
import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetPacketResolution
import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageDescriptor
import com.playsay.worksheetimport.domain.WorksheetPageRole
import com.playsay.worksheetimport.domain.WorksheetSectionType
import java.time.Duration
import java.util.ArrayDeque
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.jupiter.api.Test

class WorksheetOpenAiAnalysisProviderTest {
    private val mapper = jacksonObjectMapper().findAndRegisterModules()

    @Test
    fun `sends only a bounded raster and validates page and packet responses`() {
        val pageId = UUID.randomUUID()
        val page = WorksheetPageAnalysis(
            pageId = pageId,
            role = WorksheetPageRole.STATIC_REFERENCE,
            roleConfidence = 0.95,
            sections = listOf(WorksheetSectionType.STATIC_CONTENT),
            words = emptyList(),
            groups = emptyList(),
        )
        val packet = WorksheetPacketResolution(orderedPageIds = listOf(pageId), pages = listOf(page), answerKeyAssociations = emptyList())
        val transport = RecordingTransport(response(page), response(packet))
        val provider = provider(transport)
        val descriptor = WorksheetPageDescriptor(pageId, UUID.randomUUID(), 2, 0, 10, 10, "private-key")

        assertEquals(page, provider.analyzePage(descriptor, "raster".toByteArray(), "image/png"))
        assertEquals(packet, provider.resolvePacket(listOf(pageId), listOf(page)))

        assertTrue(transport.requests.first().contains("data:image/png;base64,"))
        assertFalse(transport.requests.first().contains("private-key"))
        assertFalse(transport.requests.first().contains("%PDF"))
        assertTrue(transport.requests.all { it.contains("\"strict\":true") })
        assertEquals(listOf(4 * 1024 * 1024, 4 * 1024 * 1024), transport.responseBounds)
    }

    @Test
    fun `rejects oversized rasters before transport`() {
        val transport = RecordingTransport()
        val properties = properties().copy(analysis = properties().analysis.copy(maxVisionBytes = 4))
        val provider = OpenAiWorksheetAnalysisProvider(transport, properties, mapper, WorksheetAnalysisPromptBuilder(), WorksheetAnalysisValidator(mapper))
        val descriptor = WorksheetPageDescriptor(UUID.randomUUID(), UUID.randomUUID(), null, 0, 1, 1, "private")

        assertFailsWith<WorksheetAnalysisProviderException> { provider.analyzePage(descriptor, ByteArray(5), "image/png") }
        assertTrue(transport.requests.isEmpty())
    }

    private fun provider(transport: OpenAiResponsesTransport) = OpenAiWorksheetAnalysisProvider(
        transport, properties(), mapper, WorksheetAnalysisPromptBuilder(), WorksheetAnalysisValidator(mapper),
    )

    private fun properties() = WorksheetImportProperties(
        analysis = WorksheetImportProperties.Analysis(provider = "openai", apiKey = "secret", model = "gpt-test"),
    )

    private fun response(value: Any): String = mapper.writeValueAsString(mapOf("output_text" to mapper.writeValueAsString(value)))

    private class RecordingTransport(vararg responses: String) : OpenAiResponsesTransport {
        private val responses = ArrayDeque(responses.toList())
        val requests = mutableListOf<String>()
        val responseBounds = mutableListOf<Int>()

        override fun createResponse(baseUrl: String, apiKey: String, requestBody: String): String = error("bounded transport required")

        override fun createBoundedResponse(baseUrl: String, apiKey: String, requestBody: String, timeout: Duration, maxResponseBytes: Int): String {
            requests += requestBody
            responseBounds += maxResponseBytes
            return responses.removeFirst()
        }
    }
}
