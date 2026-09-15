package com.playsay.gateway.service

import com.playsay.gateway.client.HtmlGameOptimizerClientException
import com.playsay.gateway.client.MaterialHtmlGameOptimizerClient
import com.playsay.gateway.dto.HtmlGameOptimizationResult
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.mockito.ArgumentMatchers.argThat
import org.mockito.ArgumentMatchers.eq
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`

class MaterialHtmlGameOptimizationServiceTest {
    private val client = mock(MaterialHtmlGameOptimizerClient::class.java)
    private val uploadService = mock(MaterialAssetUploadService::class.java)
    private val meters = SimpleMeterRegistry()
    private val service = MaterialHtmlGameOptimizationService(client, uploadService, meters)

    @Test
    fun `small games stay byte-identical without processor call`() {
        val html = "<html><p>small</p></html>"
        val upload = validated(html)

        val result = service.optimizeIfRequired(upload)

        assertEquals(upload, result.upload)
        assertEquals("NOT_NEEDED", result.metadata.status)
        assertEquals(upload.bytes.size, result.metadata.outputBytes)
        verifyNoInteractions(client)
    }

    @Test
    fun `validates aggregate accounting and revalidates optimized bytes`() {
        val sourceHtml = "<html><img src=\"data:image/png;base64,${"A".repeat(300_000)}\"></html>"
        val source = validated(sourceHtml)
        val outputHtml = "<html><img src=\"data:image/png;base64,iVBORw0KGgo=\"></html>"
        val output = validated(outputHtml)
        val response = response(source, outputHtml, "OPTIMIZED", 1)
        `when`(client.optimize(sourceHtml)).thenReturn(response)
        `when`(
            uploadService.revalidateHtmlGameBytes(
                nonNullEq(source),
                matchingBytes(outputHtml.toByteArray()),
            ),
        ).thenReturn(output)

        val result = service.optimizeIfRequired(source)

        assertEquals(output, result.upload)
        assertEquals("OPTIMIZED", result.metadata.status)
        assertEquals(source.bytes.size - output.bytes.size, result.metadata.bytesSaved)
        assertEquals(1.0, meters.counter("playsay.html_game.image_optimization", "status", "optimized").count())
        assertEquals(
            result.metadata.bytesSaved.toDouble(),
            meters.summary("playsay.html_game.image_optimization_bytes_saved").totalAmount(),
        )
    }

    @Test
    fun `malformed processor accounting becomes safe retryable public failure`() {
        val sourceHtml = "<html><img src=\"data:image/webp;base64,${"A".repeat(300_000)}\"></html>"
        val source = validated(sourceHtml)
        `when`(client.optimize(sourceHtml)).thenReturn(response(source, "<html></html>", "OPTIMIZED", 0))

        val failure = assertFailsWith<ProjectResponseException> { service.optimizeIfRequired(source) }

        assertEquals(MetaData.ErrorCodes.MATERIAL_HTML_GAME_OPTIMIZATION_UNAVAILABLE, failure.errorCode)
        assertEquals(
            1.0,
            meters.counter("playsay.html_game.image_optimization_failures", "reason", "invalid_response").count(),
        )
        verifyNoInteractions(uploadService)
    }

    @Test
    fun `processor image and availability errors retain separate public codes`() {
        val sourceHtml = "<html><img src=\"data:image/jpeg;base64,${"A".repeat(300_000)}\"></html>"
        val source = validated(sourceHtml)
        doThrow(
            HtmlGameOptimizerClientException(invalidImage = true),
            HtmlGameOptimizerClientException(invalidImage = false),
        ).`when`(client).optimize(sourceHtml)
        assertEquals(
            MetaData.ErrorCodes.MATERIAL_HTML_GAME_IMAGE_INVALID,
            assertFailsWith<ProjectResponseException> { service.optimizeIfRequired(source) }.errorCode,
        )
        assertEquals(
            MetaData.ErrorCodes.MATERIAL_HTML_GAME_OPTIMIZATION_UNAVAILABLE,
            assertFailsWith<ProjectResponseException> { service.optimizeIfRequired(source) }.errorCode,
        )
    }

    private fun validated(html: String) = ValidatedMaterialAssetFile(
        originalFileName = "game.html",
        contentType = "text/html",
        bytes = html.toByteArray(),
        text = html,
    )

    private fun <T> nonNullEq(value: T): T {
        eq(value)
        return value
    }

    private fun matchingBytes(expected: ByteArray): ByteArray {
        argThat<ByteArray> { actual -> actual.contentEquals(expected) }
        return expected
    }

    private fun response(
        source: ValidatedMaterialAssetFile,
        html: String,
        status: String,
        replacedCount: Int,
    ): HtmlGameOptimizationResult {
        val outputBytes = html.toByteArray().size
        return HtmlGameOptimizationResult(
            html = html,
            policy = "embedded-raster-v1",
            status = status,
            inputBytes = source.bytes.size,
            outputBytes = outputBytes,
            eligibleCount = 1,
            replacedCount = replacedCount,
            bytesSaved = source.bytes.size - outputBytes,
            durationMs = 5,
        )
    }
}
