package com.playsay.gateway.service

import com.playsay.gateway.dto.MaterialDocumentPageManifestResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.OutputKeys
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult
import org.apache.pdfbox.Loader
import org.apache.pdfbox.cos.COSName
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.multipart.MultipartFile
import org.w3c.dom.Document
import org.w3c.dom.Element

@Component
class MaterialDocumentPreparationService {
    fun prepare(file: MultipartFile): PreparedMaterialDocument {
        if (file.size > DOCUMENT_MAX_BYTES) {
            fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_TOO_LARGE, DOCUMENT_MAX_MEGABYTES)
        }
        val bytes = file.bytes
        if (bytes.isEmpty()) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        val fileName = cleanMaterialAssetFileName(file.originalFilename)
        val format = detectFormat(fileName, file.contentType, bytes)
        val prepared = when (format) {
            MaterialDocumentFormat.PDF -> preparePdf(bytes.copyOf())
            MaterialDocumentFormat.PPTX -> preparePptx(bytes.copyOf())
        }
        return prepared.copy(
            originalFileName = fileName,
            sourceBytes = bytes,
            revision = sha256(prepared.displayBytes),
        )
    }

    private fun detectFormat(fileName: String?, contentType: String?, bytes: ByteArray): MaterialDocumentFormat {
        val normalizedType = contentType?.substringBefore(';')?.trim()?.lowercase()
        val lowerName = fileName?.lowercase().orEmpty()
        return when {
            bytes.size >= 5 && bytes.copyOfRange(0, 5).contentEquals("%PDF-".toByteArray()) &&
                (normalizedType == "application/pdf" || lowerName.endsWith(".pdf")) -> MaterialDocumentFormat.PDF
            bytes.size >= 4 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte() &&
                (normalizedType == PPTX_MIME || lowerName.endsWith(".pptx")) -> MaterialDocumentFormat.PPTX
            else -> fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSUPPORTED_TYPE)
        }
    }

    private fun preparePdf(source: ByteArray): PreparedMaterialDocument = try {
        Loader.loadPDF(source).use { document ->
            if (document.isEncrypted || document.numberOfPages !in 1..DOCUMENT_MAX_PAGES) {
                fail(
                    if (document.numberOfPages > DOCUMENT_MAX_PAGES) MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED
                    else MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE,
                )
            }
            val catalog = document.documentCatalog
            catalog.openAction = null
            catalog.actions = null
            catalog.acroForm = null
            catalog.names?.apply {
                embeddedFiles = null
                cosObject.removeItem(COSName.JAVA_SCRIPT)
            }
            val pages = document.pages.mapIndexed { index, page ->
                page.actions = null
                page.annotations.clear()
                MaterialDocumentPageManifestResponse(
                    id = "page-${index + 1}",
                    index = index,
                    width = page.mediaBox.width.toDouble(),
                    height = page.mediaBox.height.toDouble(),
                )
            }
            val output = ByteArrayOutputStream()
            document.save(output)
            PreparedMaterialDocument(
                format = MaterialDocumentFormat.PDF,
                mimeType = "application/pdf",
                extension = "pdf",
                originalFileName = null,
                sourceBytes = source,
                displayBytes = output.toByteArray(),
                revision = "",
                pages = pages,
            )
        }
    } catch (exception: ProjectResponseException) {
        throw exception
    } catch (exception: Exception) {
        fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
    }

    private fun preparePptx(source: ByteArray): PreparedMaterialDocument {
        val entries = readBoundedZip(source)
        val presentationBytes = entries[PRESENTATION_PATH]
            ?: fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        val relationshipsBytes = entries[PRESENTATION_RELS_PATH]
            ?: fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        if (entries.keys.any(::isUnsafePptxEntry)) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE)
        entries.filterKeys { it.endsWith(".rels") }.values.forEach { bytes ->
            val relationships = parseXml(bytes)
            val nodes = relationships.getElementsByTagNameNS(RELATIONSHIPS_NS, "Relationship")
            repeat(nodes.length) { index ->
                val relation = nodes.item(index) as? Element ?: return@repeat
                if (relation.getAttribute("TargetMode").equals("External", ignoreCase = true)) {
                    fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE)
                }
            }
        }

        val presentation = parseXml(presentationBytes)
        val relationships = parseXml(relationshipsBytes)
        val slideTargetsById = relationshipTargets(relationships)
        val slideIds = presentation.getElementsByTagNameNS(PRESENTATION_NS, "sldId")
        val visibleSlides = mutableListOf<String>()
        val hiddenSlides = mutableSetOf<String>()
        repeat(slideIds.length) { index ->
            val slide = slideIds.item(index) as Element
            val relationshipId = slide.getAttributeNS(OFFICE_RELATIONSHIPS_NS, "id")
            val target = slideTargetsById[relationshipId]
                ?: fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
            val path = resolvePptTarget(PRESENTATION_PATH, target)
            val hidden = slide.getAttribute("show").lowercase() in setOf("0", "false", "off")
            if (hidden) hiddenSlides += path else visibleSlides += path
        }
        if (visibleSlides.isEmpty() || visibleSlides.size > DOCUMENT_MAX_PAGES) {
            fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED)
        }
        removeHiddenSlideIds(presentation)

        val slideSize = presentation.getElementsByTagNameNS(PRESENTATION_NS, "sldSz").item(0) as? Element
        val width = slideSize?.getAttribute("cx")?.toDoubleOrNull()?.div(12_700.0) ?: 960.0
        val height = slideSize?.getAttribute("cy")?.toDoubleOrNull()?.div(12_700.0) ?: 540.0
        val removed = entries.keys.filterTo(mutableSetOf()) { path ->
            path.startsWith("ppt/notesSlides/") ||
                path.startsWith("ppt/notesMasters/") ||
                path.startsWith("ppt/comments/") ||
                path.startsWith("ppt/commentAuthors") ||
                hiddenSlides.any { hidden -> path == hidden || path == slideRelsPath(hidden) }
        }

        val output = ByteArrayOutputStream()
        ZipOutputStream(output).use { zip ->
            entries.forEach { (path, bytes) ->
                if (path in removed) return@forEach
                val sanitized = when {
                    path == PRESENTATION_PATH -> serializeXml(presentation)
                    path.endsWith(".rels") -> sanitizeRelationships(bytes, path, removed)
                    path == "[Content_Types].xml" -> sanitizeContentTypes(bytes, removed)
                    else -> bytes
                }
                zip.putNextEntry(ZipEntry(path))
                zip.write(sanitized)
                zip.closeEntry()
            }
        }
        return PreparedMaterialDocument(
            format = MaterialDocumentFormat.PPTX,
            mimeType = PPTX_MIME,
            extension = "pptx",
            originalFileName = null,
            sourceBytes = source,
            displayBytes = output.toByteArray(),
            revision = "",
            pages = visibleSlides.mapIndexed { index, _ ->
                MaterialDocumentPageManifestResponse("slide-${index + 1}", index, width, height)
            },
        )
    }

    private fun readBoundedZip(bytes: ByteArray): LinkedHashMap<String, ByteArray> {
        val entries = linkedMapOf<String, ByteArray>()
        var expandedBytes = 0L
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val path = entry.name.replace('\\', '/')
                if (path.startsWith("/") || path.split('/').any { it == ".." } || entries.containsKey(path)) {
                    fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
                }
                if (entries.size >= DOCUMENT_MAX_ZIP_ENTRIES) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED)
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val read = zip.read(buffer)
                    if (read < 0) break
                    expandedBytes += read
                    if (expandedBytes > DOCUMENT_MAX_EXPANDED_BYTES) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED)
                    output.write(buffer, 0, read)
                }
                if (!entry.isDirectory) entries[path] = output.toByteArray()
                zip.closeEntry()
            }
        }
        if (entries["[Content_Types].xml"] == null) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        return entries
    }

    private fun sanitizeRelationships(bytes: ByteArray, relsPath: String, removed: Set<String>): ByteArray {
        val document = parseXml(bytes)
        val relationships = document.getElementsByTagNameNS(RELATIONSHIPS_NS, "Relationship")
        val delete = mutableListOf<Element>()
        repeat(relationships.length) { index ->
            val relation = relationships.item(index) as? Element ?: return@repeat
            val type = relation.getAttribute("Type")
            val target = relation.getAttribute("Target")
            val ownerPath = relsOwnerPath(relsPath)
            val resolvedTarget = resolvePptTarget(ownerPath, target)
            if (
                resolvedTarget in removed ||
                type.endsWith("/notesSlide") ||
                type.endsWith("/comments") ||
                type.endsWith("/commentAuthors")
            ) delete += relation
        }
        delete.forEach { it.parentNode.removeChild(it) }
        return serializeXml(document)
    }

    private fun sanitizeContentTypes(bytes: ByteArray, removed: Set<String>): ByteArray {
        val document = parseXml(bytes)
        val overrides = document.getElementsByTagNameNS(CONTENT_TYPES_NS, "Override")
        val delete = mutableListOf<Element>()
        repeat(overrides.length) { index ->
            val override = overrides.item(index) as? Element ?: return@repeat
            if (override.getAttribute("PartName").removePrefix("/") in removed) delete += override
        }
        delete.forEach { it.parentNode.removeChild(it) }
        return serializeXml(document)
    }

    private fun relationshipTargets(document: Document): Map<String, String> {
        val result = mutableMapOf<String, String>()
        val relationships = document.getElementsByTagNameNS(RELATIONSHIPS_NS, "Relationship")
        repeat(relationships.length) { index ->
            val relation = relationships.item(index) as? Element ?: return@repeat
            result[relation.getAttribute("Id")] = relation.getAttribute("Target")
        }
        return result
    }

    private fun removeHiddenSlideIds(document: Document) {
        val slideIds = document.getElementsByTagNameNS(PRESENTATION_NS, "sldId")
        val delete = mutableListOf<Element>()
        repeat(slideIds.length) { index ->
            val slide = slideIds.item(index) as Element
            if (slide.getAttribute("show").lowercase() in setOf("0", "false", "off")) delete += slide
        }
        delete.forEach { it.parentNode.removeChild(it) }
    }

    private fun parseXml(bytes: ByteArray): Document {
        val factory = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
            setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            setFeature("http://xml.org/sax/features/external-general-entities", false)
            setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "")
            setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "")
        }
        return try {
            factory.newDocumentBuilder().parse(ByteArrayInputStream(bytes))
        } catch (exception: Exception) {
            fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        }
    }

    private fun serializeXml(document: Document): ByteArray {
        val output = ByteArrayOutputStream()
        TransformerFactory.newInstance().apply {
            setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "")
            setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "")
        }.newTransformer().apply {
            setOutputProperty(OutputKeys.ENCODING, "UTF-8")
            setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no")
        }.transform(DOMSource(document), StreamResult(output))
        return output.toByteArray()
    }

    private fun isUnsafePptxEntry(path: String): Boolean {
        val lower = path.lowercase()
        return lower.startsWith("ppt/activex/") ||
            lower.startsWith("ppt/embeddings/") ||
            lower.contains("vbaproject") ||
            lower.endsWith(".bin") ||
            lower.endsWith(".exe") ||
            lower.endsWith(".dll") ||
            lower.endsWith(".js") ||
            lower.endsWith(".mp4") ||
            lower.endsWith(".mov") ||
            lower.endsWith(".avi") ||
            lower.endsWith(".mp3") ||
            lower.endsWith(".wav") ||
            lower.endsWith(".m4a")
    }

    private fun resolvePptTarget(ownerPath: String, target: String): String {
        val base = ownerPath.substringBeforeLast('/', "")
        val stack = mutableListOf<String>()
        (if (target.startsWith('/')) target.removePrefix("/") else "$base/$target")
            .split('/')
            .filter { it.isNotEmpty() && it != "." }
            .forEach { part -> if (part == "..") stack.removeLastOrNull() else stack += part }
        return stack.joinToString("/")
    }

    private fun relsOwnerPath(relsPath: String): String {
        val marker = "/_rels/"
        if (!relsPath.contains(marker) || !relsPath.endsWith(".rels")) return relsPath
        val (prefix, file) = relsPath.split(marker, limit = 2)
        return "$prefix/${file.removeSuffix(".rels")}".removePrefix("/")
    }

    private fun slideRelsPath(slidePath: String): String =
        slidePath.substringBeforeLast('/') + "/_rels/" + slidePath.substringAfterLast('/') + ".rels"

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun fail(code: String, vararg args: Any): Nothing =
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, code, *args)
}

enum class MaterialDocumentFormat { PDF, PPTX }

data class PreparedMaterialDocument(
    val format: MaterialDocumentFormat,
    val mimeType: String,
    val extension: String,
    val originalFileName: String?,
    val sourceBytes: ByteArray,
    val displayBytes: ByteArray,
    val revision: String,
    val pages: List<MaterialDocumentPageManifestResponse>,
)

private const val DOCUMENT_MAX_MEGABYTES = 64
private const val DOCUMENT_MAX_BYTES = DOCUMENT_MAX_MEGABYTES * 1024L * 1024L
private const val DOCUMENT_MAX_PAGES = 50
private const val DOCUMENT_MAX_ZIP_ENTRIES = 10_000
private const val DOCUMENT_MAX_EXPANDED_BYTES = 256L * 1024L * 1024L
private const val PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
private const val PRESENTATION_PATH = "ppt/presentation.xml"
private const val PRESENTATION_RELS_PATH = "ppt/_rels/presentation.xml.rels"
private const val PRESENTATION_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
private const val OFFICE_RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
private const val RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
private const val CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
