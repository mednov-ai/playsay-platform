package com.playsay.gateway.service

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFails
import kotlin.test.assertTrue
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.springframework.mock.web.MockMultipartFile

class MaterialDocumentPreparationServiceTest {
    private val service = MaterialDocumentPreparationService()

    @Test
    fun `prepares bounded pdf manifest and display revision`() {
        val bytes = ByteArrayOutputStream().use { output ->
            PDDocument().use { document ->
                document.addPage(PDPage())
                document.addPage(PDPage())
                document.save(output)
            }
            output.toByteArray()
        }

        val result = service.prepare(MockMultipartFile("file", "lesson.pdf", "application/pdf", bytes))

        assertEquals(MaterialDocumentFormat.PDF, result.format)
        assertEquals(listOf("page-1", "page-2"), result.pages.map { it.id })
        assertEquals(64, result.revision.length)
        assertTrue(result.displayBytes.copyOfRange(0, 5).contentEquals("%PDF-".toByteArray()))
    }

    @Test
    fun `removes hidden slides notes and comments from pptx derivative`() {
        val result = service.prepare(MockMultipartFile("file", "lesson.pptx", PPTX_CONTENT_TYPE, pptxFixture()))
        val entries = zipEntries(result.displayBytes)

        assertEquals(MaterialDocumentFormat.PPTX, result.format)
        assertEquals(listOf("slide-1"), result.pages.map { it.id })
        assertTrue("ppt/slides/slide1.xml" in entries)
        assertFalse("ppt/slides/slide2.xml" in entries)
        assertFalse(entries.keys.any { it.startsWith("ppt/notes") || it.startsWith("ppt/comments") })
        assertFalse(entries.getValue("ppt/presentation.xml").toString(Charsets.UTF_8).contains("rId2"))
    }

    @Test
    fun `rejects pptx external relationships`() {
        val unsafe = pptxFixture(externalRelationship = true)
        assertFails {
            service.prepare(MockMultipartFile("file", "unsafe.pptx", PPTX_CONTENT_TYPE, unsafe))
        }
    }

    private fun pptxFixture(externalRelationship: Boolean = false): ByteArray {
        val entries = linkedMapOf(
            "[Content_Types].xml" to """<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/slides/slide1.xml" ContentType="application/xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/xml"/><Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/xml"/></Types>""",
            "ppt/presentation.xml" to """<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="1" r:id="rId1"/><p:sldId id="2" r:id="rId2" show="0"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>""",
            "ppt/_rels/presentation.xml.rels" to """<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>${if (externalRelationship) "<Relationship Id=\"rId3\" Type=\"x\" Target=\"https://example.com\" TargetMode=\"External\"/>" else ""}</Relationships>""",
            "ppt/slides/slide1.xml" to "<slide>visible</slide>",
            "ppt/slides/slide2.xml" to "<slide>hidden</slide>",
            "ppt/slides/_rels/slide1.xml.rels" to """<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="notes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>""",
            "ppt/notesSlides/notesSlide1.xml" to "<notes>private</notes>",
            "ppt/comments/comment1.xml" to "<comments>private</comments>",
        )
        return ByteArrayOutputStream().use { output ->
            ZipOutputStream(output).use { zip ->
                entries.forEach { (path, value) ->
                    zip.putNextEntry(ZipEntry(path))
                    zip.write(value.toByteArray())
                    zip.closeEntry()
                }
            }
            output.toByteArray()
        }
    }

    private fun zipEntries(bytes: ByteArray): Map<String, ByteArray> {
        val result = linkedMapOf<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                result[entry.name] = zip.readBytes()
            }
        }
        return result
    }
}

private const val PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
