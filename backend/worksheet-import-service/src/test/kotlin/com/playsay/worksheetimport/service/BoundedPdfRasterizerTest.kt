package com.playsay.worksheetimport.service

import com.playsay.worksheetimport.config.WorksheetImportProperties
import java.nio.file.Files
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.apache.pdfbox.cos.COSDictionary
import org.apache.pdfbox.cos.COSName
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.encryption.AccessPermission
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class BoundedPdfRasterizerTest {
    @Test
    fun `renders bounded pages and removes output on close`() {
        val source = pdf(PDPage(PDRectangle(72f, 36f)), PDPage(PDRectangle(36f, 72f)))
        val rasterized = rasterizer().rasterize(source)

        assertEquals(listOf(1, 2), rasterized.pages.map { it.sourcePageNumber })
        assertEquals(144 to 72, rasterized.pages.first().width to rasterized.pages.first().height)
        assertTrue(rasterized.pages.all { Files.exists(it.path) })
        val output = rasterized.pages.first().path

        rasterized.close()
        assertFalse(Files.exists(output))
        Files.deleteIfExists(source)
    }

    @Test
    fun `rejects encrypted documents`() {
        val source = Files.createTempFile("worksheet-encrypted-", ".pdf")
        PDDocument().use { document ->
            document.addPage(PDPage())
            document.protect(StandardProtectionPolicy("owner", "user", AccessPermission()))
            document.save(source.toFile())
        }

        assertEquals(PdfRejectionCode.ENCRYPTED, assertThrows<PdfRejectedException> { rasterizer().rasterize(source) }.code)
        Files.deleteIfExists(source)
    }

    @Test
    fun `rejects active catalog content without rendering it`() {
        val source = Files.createTempFile("worksheet-active-", ".pdf")
        PDDocument().use { document ->
            document.addPage(PDPage())
            document.documentCatalog.cosObject.setItem(COSName.OPEN_ACTION, COSDictionary())
            document.save(source.toFile())
        }

        assertEquals(PdfRejectionCode.ACTIVE_CONTENT, assertThrows<PdfRejectedException> { rasterizer().rasterize(source) }.code)
        Files.deleteIfExists(source)
    }

    @Test
    fun `rejects page count and raster memory bounds atomically`() {
        val twoPages = pdf(PDPage(), PDPage())
        val pageCountError = assertThrows<PdfRejectedException> {
            rasterizer(pdf = WorksheetImportProperties.Pdf(maxPages = 1)).rasterize(twoPages)
        }
        assertEquals(PdfRejectionCode.TOO_MANY_PAGES, pageCountError.code)

        val large = pdf(PDPage(PDRectangle(2000f, 2000f)))
        val memoryError = assertThrows<PdfRejectedException> {
            rasterizer(pdf = WorksheetImportProperties.Pdf(maxMemoryBytes = 32L * 1024 * 1024, maxPagePixels = 40_000_000)).rasterize(large)
        }
        assertEquals(PdfRejectionCode.MEMORY_LIMIT_EXCEEDED, memoryError.code)
        Files.deleteIfExists(twoPages)
        Files.deleteIfExists(large)
    }

    @Test
    fun `rejects corrupt and timed out inputs with sanitized codes`() {
        val corrupt = Files.createTempFile("worksheet-corrupt-", ".pdf")
        Files.writeString(corrupt, "%PDF-1.7 not a document")
        assertEquals(PdfRejectionCode.CORRUPT, assertThrows<PdfRejectedException> { rasterizer().rasterize(corrupt) }.code)

        val valid = pdf(PDPage())
        assertEquals(
            PdfRejectionCode.TIMEOUT,
            assertThrows<PdfRejectedException> {
                rasterizer(pdf = WorksheetImportProperties.Pdf(timeout = Duration.ofNanos(1))).rasterize(valid)
            }.code,
        )
        Files.deleteIfExists(corrupt)
        Files.deleteIfExists(valid)
    }

    private fun rasterizer(pdf: WorksheetImportProperties.Pdf = WorksheetImportProperties.Pdf()) =
        BoundedPdfRasterizer(WorksheetImportProperties(pdf = pdf))

    private fun pdf(vararg pages: PDPage): java.nio.file.Path {
        val target = Files.createTempFile("worksheet-", ".pdf")
        PDDocument().use { document ->
            pages.forEach(document::addPage)
            document.save(target.toFile())
        }
        return target
    }
}
