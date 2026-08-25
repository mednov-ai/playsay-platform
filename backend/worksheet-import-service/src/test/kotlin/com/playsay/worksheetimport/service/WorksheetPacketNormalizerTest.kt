package com.playsay.worksheetimport.service

import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetSourceKind
import com.playsay.worksheetimport.domain.WorksheetUploadRejectionCode
import java.awt.image.BufferedImage
import java.nio.file.Files
import java.util.UUID
import javax.imageio.ImageIO
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.junit.jupiter.api.Test

class WorksheetPacketNormalizerTest {
    @Test
    fun `expands mixed sources into globally ordered pages and private provenance`() {
        val properties = WorksheetImportProperties()
        val storage = InMemoryWorksheetStagingStorage()
        val normalizer = WorksheetPacketNormalizer(properties, BoundedPdfRasterizer(properties), storage)
        val image = imageUpload(0)
        val pdf = pdfUpload(1, 2)

        normalizer.normalize(UUID.randomUUID(), listOf(pdf, image)).use { packet ->
            assertEquals(listOf(0, 1), packet.sources.map { it.order })
            assertEquals(listOf(0, 1, 2), packet.pages.map { it.order })
            assertEquals(listOf(null, 1, 2), packet.pages.map { it.sourcePageNumber })
            assertEquals(3, packet.pages.map { it.previewPath }.distinct().size)
            assertEquals(4, storage.keys().size) // image, original PDF and two derived rasters
            assertTrue(packet.rejected.isEmpty())
            packet.commit()
        }
        assertEquals(4, storage.keys().size)
        image.path.parent.toFile().deleteRecursively()
        pdf.path.parent.toFile().deleteRecursively()
    }

    @Test
    fun `rejects invalid PDF without losing a valid image`() {
        val properties = WorksheetImportProperties()
        val storage = InMemoryWorksheetStagingStorage()
        val normalizer = WorksheetPacketNormalizer(properties, BoundedPdfRasterizer(properties), storage)
        val image = imageUpload(0)
        val invalid = staged(1, "bad.pdf", "application/pdf", WorksheetSourceKind.PDF, "%PDF-bad".toByteArray())

        normalizer.normalize(UUID.randomUUID(), listOf(image, invalid)).use { packet ->
            assertEquals(1, packet.sources.size)
            assertEquals(WorksheetUploadRejectionCode.INVALID_PDF, packet.rejected.single().code)
        }
        assertTrue(storage.keys().isEmpty())
        image.path.parent.toFile().deleteRecursively()
        invalid.path.parent.toFile().deleteRecursively()
    }

    @Test
    fun `compensates every stored object when a later write fails`() {
        val properties = WorksheetImportProperties()
        val delegate = InMemoryWorksheetStagingStorage()
        var writes = 0
        val failing = object : WorksheetStagingStorage {
            override fun put(key: String, source: java.nio.file.Path, contentType: String) {
                writes += 1
                if (writes == 2) error("synthetic storage failure")
                delegate.put(key, source, contentType)
            }
            override fun get(key: String) = delegate.get(key)
            override fun delete(key: String) = delegate.delete(key)
        }
        val normalizer = WorksheetPacketNormalizer(properties, BoundedPdfRasterizer(properties), failing)
        val first = imageUpload(0)
        val second = imageUpload(1)

        assertFailsWith<IllegalStateException> { normalizer.normalize(UUID.randomUUID(), listOf(first, second)) }
        assertTrue(delegate.keys().isEmpty())
        first.path.parent.toFile().deleteRecursively()
        second.path.parent.toFile().deleteRecursively()
    }

    @Test
    fun `normalizes an eight page packet with stable global order`() {
        val properties = WorksheetImportProperties(packet = WorksheetImportProperties.Packet(maxPages = 8))
        val storage = InMemoryWorksheetStagingStorage()
        val normalizer = WorksheetPacketNormalizer(properties, BoundedPdfRasterizer(properties), storage)
        val uploads = (0 until 8).map(::imageUpload)

        normalizer.normalize(UUID.randomUUID(), uploads.reversed()).use { packet ->
            assertEquals((0 until 8).toList(), packet.sources.map { it.order })
            assertEquals((0 until 8).toList(), packet.pages.map { it.order })
            assertEquals(8, packet.pages.map { it.id }.distinct().size)
        }
        uploads.forEach { it.path.parent.toFile().deleteRecursively() }
        assertTrue(storage.keys().isEmpty())
    }

    private fun imageUpload(order: Int): StagedWorksheetUpload {
        val directory = Files.createTempDirectory("worksheet-image-test-")
        val path = directory.resolve("image.png")
        ImageIO.write(BufferedImage(4, 3, BufferedImage.TYPE_INT_RGB), "png", path.toFile())
        return StagedWorksheetUpload(order, "image-$order.png", "image/png", WorksheetSourceKind.IMAGE, Files.size(path), sha256(path), path, 4, 3)
    }

    private fun pdfUpload(order: Int, pages: Int): StagedWorksheetUpload {
        val directory = Files.createTempDirectory("worksheet-pdf-test-")
        val path = directory.resolve("pages.pdf")
        PDDocument().use { document ->
            repeat(pages) { document.addPage(PDPage(PDRectangle(72f, 36f))) }
            document.save(path.toFile())
        }
        return StagedWorksheetUpload(order, "pages.pdf", "application/pdf", WorksheetSourceKind.PDF, Files.size(path), sha256(path), path)
    }

    private fun staged(order: Int, name: String, mime: String, kind: WorksheetSourceKind, bytes: ByteArray): StagedWorksheetUpload {
        val directory = Files.createTempDirectory("worksheet-source-test-")
        val path = directory.resolve("source")
        Files.write(path, bytes)
        return StagedWorksheetUpload(order, name, mime, kind, bytes.size.toLong(), sha256(path), path)
    }
}
