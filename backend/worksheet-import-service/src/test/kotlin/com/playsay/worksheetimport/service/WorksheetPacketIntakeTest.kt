package com.playsay.worksheetimport.service

import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetSourceKind
import com.playsay.worksheetimport.domain.WorksheetUploadRejectionCode
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.springframework.mock.web.MockMultipartFile

class WorksheetPacketIntakeTest {
    @Test
    fun `accepts supported image and PDF signatures in source order`() {
        val intake = WorksheetPacketIntake(WorksheetImportProperties())
        val image = MockMultipartFile("files", "page.png", "image/png", png(4, 3))
        val pdf = MockMultipartFile("files", "pages.pdf", "application/pdf", "%PDF-1.7\nsynthetic".toByteArray())

        intake.inspect(listOf(image, pdf)).use { result ->
            assertTrue(result.rejected.isEmpty())
            assertEquals(listOf(0, 1), result.accepted.map(StagedWorksheetUpload::sourceOrder))
            assertEquals(listOf(WorksheetSourceKind.IMAGE, WorksheetSourceKind.PDF), result.accepted.map(StagedWorksheetUpload::kind))
            assertEquals(4 to 3, result.accepted.first().width to result.accepted.first().height)
            assertEquals(64, result.accepted.first().checksumSha256.length)
            assertTrue(result.accepted.all { staged -> java.nio.file.Files.exists(staged.path) })
        }
    }

    @Test
    fun `returns file-level rejections without discarding valid selections`() {
        val intake = WorksheetPacketIntake(WorksheetImportProperties())
        val valid = MockMultipartFile("files", "safe.png", "image/png", png(2, 2))
        val empty = MockMultipartFile("files", "empty.png", "image/png", byteArrayOf())
        val mismatch = MockMultipartFile("files", "fake.png", "image/png", "%PDF-1.7".toByteArray())
        val unsupported = MockMultipartFile("files", "notes.txt", "text/plain", "hello".toByteArray())

        intake.inspect(listOf(valid, empty, mismatch, unsupported)).use { result ->
            assertEquals(listOf("safe.png"), result.accepted.map(StagedWorksheetUpload::fileName))
            assertEquals(
                listOf(WorksheetUploadRejectionCode.EMPTY, WorksheetUploadRejectionCode.CONTENT_MISMATCH, WorksheetUploadRejectionCode.UNSUPPORTED_TYPE),
                result.rejected.map { it.code },
            )
        }
    }

    @Test
    fun `enforces per-file and aggregate byte limits while spooling`() {
        val properties = WorksheetImportProperties(
            packet = WorksheetImportProperties.Packet(maxPages = 8, maxBytes = 150, maxImageBytes = 100),
            pdf = WorksheetImportProperties.Pdf(maxBytes = 100),
        )
        val intake = WorksheetPacketIntake(properties)
        val oversized = MockMultipartFile("files", "large.pdf", "application/pdf", ByteArray(101).also { "%PDF-".toByteArray().copyInto(it) })
        val first = MockMultipartFile("files", "first.pdf", "application/pdf", ByteArray(80).also { "%PDF-".toByteArray().copyInto(it) })
        val second = MockMultipartFile("files", "second.pdf", "application/pdf", ByteArray(80).also { "%PDF-".toByteArray().copyInto(it) })

        intake.inspect(listOf(oversized, first, second)).use { result ->
            assertEquals(listOf("first.pdf"), result.accepted.map(StagedWorksheetUpload::fileName))
            assertEquals(listOf(WorksheetUploadRejectionCode.FILE_TOO_LARGE, WorksheetUploadRejectionCode.PACKET_TOO_LARGE), result.rejected.map { it.code })
            val acceptedPath = result.accepted.single().path
            assertTrue(java.nio.file.Files.exists(acceptedPath))
            result.close()
            assertFalse(java.nio.file.Files.exists(acceptedPath))
        }
    }

    private fun png(width: Int, height: Int): ByteArray = ByteArrayOutputStream().use { output ->
        ImageIO.write(BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", output)
        output.toByteArray()
    }
}
