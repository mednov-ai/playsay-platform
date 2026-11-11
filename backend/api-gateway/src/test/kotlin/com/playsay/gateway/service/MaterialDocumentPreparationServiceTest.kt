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
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.utils.MetaData
import org.apache.pdfbox.Loader
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.encryption.AccessPermission
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.mock.web.MockMultipartFile
import org.springframework.web.multipart.MultipartFile

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
        assertFalse(bytes.contentEquals(result.displayBytes))
        Loader.loadPDF(result.displayBytes).use { display ->
            assertEquals(2, display.numberOfPages)
            assertFalse(display.isEncrypted)
        }
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
        val entries = zipEntries(fixture("printer-settings-removed-preserve-xml.pptx"))
        val rels = entries.getValue("ppt/_rels/presentation.xml.rels").decodeToString()
        val disguised = rels.replace("slides/slide1.xml", "https://example.invalid/slide.xml")
        val error = assertFailsWith<ProjectResponseException> {
            service.prepare(pptxFile(writeZip(entries + ("ppt/_rels/presentation.xml.rels" to disguised.toByteArray()))))
        }
        assertEquals(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE, error.errorCode)
    }

    @Test
    fun `accepts the original two-slide printer settings fixture and removes printer bytes`() {
        val prepared = service.prepare(pptxFile(fixture("printer-settings-present.pptx")))
        val entries = zipEntries(prepared.displayBytes)
        assertEquals(listOf("slide-1", "slide-2"), prepared.pages.map { it.id })
        assertFalse(entries.keys.any { it.startsWith("ppt/printerSettings/") })
        assertFalse(entries.getValue("ppt/_rels/presentation.xml.rels").decodeToString().contains("printerSettings"))
        assertFalse(entries.getValue("[Content_Types].xml").decodeToString().contains("printerSettings"))
        assertTrue(entries.getValue("ppt/slides/slide1.xml").decodeToString().contains("SYNTHETIC QA SLIDE ONE"))
        assertTrue(entries.getValue("ppt/slides/slide2.xml").decodeToString().contains("SYNTHETIC QA SLIDE TWO"))
    }

    @Test
    fun `normalizes equivalent package namespace prefixes for the viewer`() {
        val prefixed = service.prepare(pptxFile(fixture("printer-settings-removed.pptx")))
        val defaultNamespace = service.prepare(pptxFile(fixture("printer-settings-removed-preserve-xml.pptx")))
        assertEquals(defaultNamespace.pages, prefixed.pages)
        for (result in listOf(prefixed, defaultNamespace)) {
            val entries = zipEntries(result.displayBytes)
            assertTrue(entries.getValue("ppt/_rels/presentation.xml.rels").decodeToString().contains("<Relationships"))
            assertTrue(entries.getValue("[Content_Types].xml").decodeToString().contains("<Types"))
            assertTrue(entries.getValue("ppt/slides/slide1.xml").decodeToString().contains("SYNTHETIC QA SLIDE ONE"))
            assertTrue(entries.getValue("ppt/slides/slide2.xml").decodeToString().contains("SYNTHETIC QA SLIDE TWO"))
        }
    }

    @Test
    fun `rejects unsafe binary parts even when a printer settings part is present`() {
        val entries = zipEntries(fixture("printer-settings-present.pptx"))
        for (unsafePath in listOf("ppt/vbaProject.bin", "ppt/embeddings/oleObject1.bin", "ppt/activeX/activeX1.xml", "ppt/other.bin")) {
            val error = assertFailsWith<ProjectResponseException> {
                service.prepare(pptxFile(writeZip(entries + (unsafePath to "unsafe".toByteArray()))))
            }
            assertEquals(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE, error.errorCode)
        }
    }

    @Test
    fun `rejects printer settings with an unrelated content type or relationship`() {
        val entries = zipEntries(fixture("printer-settings-present.pptx"))
        val types = entries.getValue("[Content_Types].xml").decodeToString()
        val rels = entries.getValue("ppt/_rels/presentation.xml.rels").decodeToString()
        val invalidTypes = types.replace("application/vnd.openxmlformats-officedocument.presentationml.printerSettings", "application/octet-stream")
        val invalidRels = rels.replace("relationships/printerSettings", "relationships/oleObject")
        for (modified in listOf(
            entries + ("[Content_Types].xml" to invalidTypes.toByteArray()),
            entries + ("ppt/_rels/presentation.xml.rels" to invalidRels.toByteArray()),
        )) {
            val error = assertFailsWith<ProjectResponseException> { service.prepare(pptxFile(writeZip(modified))) }
            assertEquals(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE, error.errorCode)
        }
    }

    @Test
    fun `rejects macro content types and disguised active relationships`() {
        val entries = zipEntries(fixture("printer-settings-removed-preserve-xml.pptx"))
        val types = entries.getValue("[Content_Types].xml").decodeToString()
        val rels = entries.getValue("ppt/_rels/presentation.xml.rels").decodeToString()
        val macroTypes = types.replace("presentationml.presentation.main+xml", "presentationml.presentation.macroEnabled.main+xml")
        val oleRels = rels.replace("relationships/slide\"", "relationships/oleObject\"")
        for (modified in listOf(
            entries + ("[Content_Types].xml" to macroTypes.toByteArray()),
            entries + ("ppt/_rels/presentation.xml.rels" to oleRels.toByteArray()),
        )) {
            val error = assertFailsWith<ProjectResponseException> { service.prepare(pptxFile(writeZip(modified))) }
            assertEquals(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE, error.errorCode)
        }
    }

    @Test
    fun `rejects encrypted pdf and corrupt pptx as invalid`() {
        val encrypted = ByteArrayOutputStream().use { output ->
            PDDocument().use { document ->
                document.addPage(PDPage())
                document.protect(StandardProtectionPolicy("owner-password", "user-password", AccessPermission()))
                document.save(output)
            }
            output.toByteArray()
        }
        val files = listOf(
            MockMultipartFile("file", "encrypted.pdf", "application/pdf", encrypted),
            pptxFile(byteArrayOf(0x50, 0x4b, 0x03, 0x04, 0x00)),
            pptxFile(writeZip(zipEntries(fixture("printer-settings-present.pptx")) - "[Content_Types].xml")),
        )
        for (file in files) {
            val error = assertFailsWith<ProjectResponseException> { service.prepare(file) }
            assertEquals(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE, error.errorCode)
        }
    }

    @Test
    fun `rejected upload does not publish a partial asset`() {
        val repository = mock(MaterialAssetRepo::class.java)
        val storage = mock(MaterialObjectStorage::class.java)
        val upload = MaterialDocumentAssetService(repository, storage, service)
        val entries = zipEntries(fixture("printer-settings-present.pptx"))
        val types = entries.getValue("[Content_Types].xml").decodeToString()
        val encrypted = ByteArrayOutputStream().use { output ->
            PDDocument().use { document ->
                document.addPage(PDPage())
                document.protect(StandardProtectionPolicy("owner-password", "user-password", AccessPermission()))
                document.save(output)
            }
            output.toByteArray()
        }
        val rejected = listOf(
            pptxFile(byteArrayOf(0x50, 0x4b, 0x03, 0x04, 0x00)),
            pptxFile(writeZip(entries + ("[Content_Types].xml" to types.replace("presentationml.presentation.main+xml", "presentationml.presentation.macroEnabled.main+xml").toByteArray()))),
            pptxFile(writeZip(entries + ("ppt/embeddings/oleObject1.bin" to byteArrayOf(1)))),
            pptxFile(writeZip(entries + ("ppt/activeX/activeX1.xml" to byteArrayOf(1)))),
            pptxFile(pptxFixture(externalRelationship = true)),
            MockMultipartFile("file", "encrypted.pdf", "application/pdf", encrypted),
        )
        rejected.forEach { file ->
            assertFailsWith<ProjectResponseException> { upload.upload(java.util.UUID.randomUUID(), file, "synthetic") }
        }
        verifyNoInteractions(repository, storage)
    }

    @Test
    fun `rejects oversized documents and presentations with more than fifty slides`() {
        val oversized = mock(MultipartFile::class.java)
        `when`(oversized.size).thenReturn(64L * 1024 * 1024 + 1)
        val sizeError = assertFailsWith<ProjectResponseException> { service.prepare(oversized) }
        assertEquals(MetaData.ErrorCodes.MATERIAL_DOCUMENT_TOO_LARGE, sizeError.errorCode)

        val entries = zipEntries(fixture("printer-settings-removed-preserve-xml.pptx"))
        val presentation = entries.getValue("ppt/presentation.xml").decodeToString()
        val slides = (1..51).joinToString("") { "<p:sldId id=\"${it + 255}\" r:id=\"rId7\"/>" }
        val modified = presentation.replace(Regex("<p:sldIdLst>.*?</p:sldIdLst>"), "<p:sldIdLst>$slides</p:sldIdLst>")
        val pageError = assertFailsWith<ProjectResponseException> {
            service.prepare(pptxFile(writeZip(entries + ("ppt/presentation.xml" to modified.toByteArray()))))
        }
        assertEquals(MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED, pageError.errorCode)
    }

    @Test
    fun `rejects a compressed package beyond the expanded data limit`() {
        // Directory bodies are counted but discarded, keeping this 256 MiB boundary test bounded in memory.
        val block = ByteArray(1024 * 1024)
        val bytes = ByteArrayOutputStream().use { output ->
            ZipOutputStream(output).use { zip ->
                repeat(257) { index ->
                    zip.putNextEntry(ZipEntry("expansion-$index/"))
                    zip.write(block)
                    zip.closeEntry()
                }
            }
            output.toByteArray()
        }
        assertTrue(bytes.size < 64 * 1024 * 1024)
        val error = assertFailsWith<ProjectResponseException> { service.prepare(pptxFile(bytes)) }
        assertEquals(MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED, error.errorCode)
    }

    @Test
    fun `rejects a package with too many zip entries`() {
        for (directories in listOf(false, true)) {
            val entries = zipEntries(fixture("printer-settings-removed-preserve-xml.pptx")).toMutableMap()
            repeat(10_001) { entries[if (directories) "extra/dir-$it/" else "extra/part-$it.xml"] = byteArrayOf() }
            val error = assertFailsWith<ProjectResponseException> { service.prepare(pptxFile(writeZip(entries))) }
            assertEquals(MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED, error.errorCode)
        }
    }

    private fun fixture(name: String): ByteArray =
        requireNotNull(javaClass.getResourceAsStream("/material-documents/$name")).use { it.readBytes() }

    private fun pptxFile(bytes: ByteArray) = MockMultipartFile("file", "fixture.pptx", PPTX_CONTENT_TYPE, bytes)

    private fun writeZip(entries: Map<String, ByteArray>): ByteArray = ByteArrayOutputStream().use { output ->
        ZipOutputStream(output).use { zip ->
            entries.forEach { (path, bytes) ->
                zip.putNextEntry(ZipEntry(path))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        output.toByteArray()
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
