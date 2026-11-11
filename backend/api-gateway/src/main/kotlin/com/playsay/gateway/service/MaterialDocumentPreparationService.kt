package com.playsay.gateway.service

import com.playsay.gateway.dto.MaterialDocumentPageManifestResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
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
            MaterialDocumentFormat.PDF -> prepareMaterialPdf(bytes.copyOf(), DOCUMENT_MAX_PAGES)
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

    private fun preparePptx(source: ByteArray): PreparedMaterialDocument {
        val entries = try {
            readBoundedZip(source)
        } catch (exception: IOException) {
            fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        }
        val presentationBytes = entries[PRESENTATION_PATH]
            ?: fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        val relationshipsBytes = entries[PRESENTATION_RELS_PATH]
            ?: fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        val printerSettings = validatePptxSafety(entries)

        val presentation = parseXml(presentationBytes)
        val relationships = parseXml(relationshipsBytes)
        val slides = readPptxSlides(presentation, relationships)
        if (slides.visible.isEmpty() || slides.visible.size > DOCUMENT_MAX_PAGES) {
            fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED)
        }
        removeHiddenSlideIds(presentation)

        val removed = entries.keys.filterTo(mutableSetOf()) { path ->
            path.startsWith("ppt/notesSlides/") ||
                path.startsWith("ppt/notesMasters/") ||
                path.startsWith("ppt/comments/") ||
                path.startsWith("ppt/commentAuthors") ||
                path in printerSettings ||
                slides.hidden.any { hidden -> path == hidden || path == slideRelsPath(hidden) }
        }
        return PreparedMaterialDocument(
            format = MaterialDocumentFormat.PPTX,
            mimeType = PPTX_MIME,
            extension = "pptx",
            originalFileName = null,
            sourceBytes = source,
            displayBytes = writeSanitizedPptx(entries, presentation, removed),
            revision = "",
            pages = slides.visible.mapIndexed { index, _ ->
                MaterialDocumentPageManifestResponse("slide-${index + 1}", index, slides.width, slides.height)
            },
        )
    }

    private fun validatePptxSafety(entries: Map<String, ByteArray>): Set<String> {
        val printerSettings = entries.keys.filterTo(mutableSetOf()) { PRINTER_SETTINGS_PATH.matches(it) }
        if (entries.keys.any { isUnsafePptxEntry(it) && it !in printerSettings }) {
            fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE)
        }
        val contentTypes = entries["[Content_Types].xml"] ?: fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        validatePrinterSettingsContentTypes(contentTypes, printerSettings)
        val referencedPrinterSettings = mutableSetOf<String>()
        entries.filterKeys { it.endsWith(".rels") }.forEach { (path, bytes) ->
            validatePptxRelationships(path, bytes, printerSettings, referencedPrinterSettings)
        }
        if (referencedPrinterSettings != printerSettings) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE)
        return printerSettings
    }

    private fun validatePptxRelationships(path: String, bytes: ByteArray, printerSettings: Set<String>, referenced: MutableSet<String>) {
        val relationships = parseXml(bytes)
        requirePackageRoot(relationships, RELATIONSHIPS_NS, "Relationships")
        val nodes = relationships.getElementsByTagNameNS(RELATIONSHIPS_NS, "Relationship")
        repeat(nodes.length) { index ->
            val relation = nodes.item(index) as? Element ?: return@repeat
            validatePptxRelationship(path, relation, printerSettings, referenced)
        }
    }

    private fun validatePptxRelationship(path: String, relation: Element, printerSettings: Set<String>, referenced: MutableSet<String>) {
        val mode = relation.getAttribute("TargetMode")
        val rawTarget = relation.getAttribute("Target")
        if ((mode.isNotEmpty() && !mode.equals("Internal", ignoreCase = true)) ||
            rawTarget.startsWith("//") || URI_SCHEME.containsMatchIn(rawTarget)
        ) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE)
        val type = relation.getAttribute("Type")
        if (type.substringAfterLast('/').lowercase() in UNSAFE_RELATIONSHIP_TYPES) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE)
        val target = resolvePptTarget(relsOwnerPath(path), rawTarget)
        if (target in printerSettings || type == PRINTER_SETTINGS_RELATIONSHIP) {
            if (path != PRESENTATION_RELS_PATH || type != PRINTER_SETTINGS_RELATIONSHIP ||
                target !in printerSettings || !referenced.add(target)
            ) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE)
        }
    }

    private fun validatePrinterSettingsContentTypes(bytes: ByteArray, printerSettings: Set<String>) {
        val document = parseXml(bytes)
        requirePackageRoot(document, CONTENT_TYPES_NS, "Types")
        val allContentTypes = document.getElementsByTagNameNS(CONTENT_TYPES_NS, "*")
        repeat(allContentTypes.length) { index ->
            val contentType = (allContentTypes.item(index) as? Element)?.getAttribute("ContentType")?.lowercase().orEmpty()
            if (UNSAFE_CONTENT_TYPE_MARKERS.any { it in contentType }) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE)
        }
        val defaults = document.getElementsByTagNameNS(CONTENT_TYPES_NS, "Default")
        val binDefaults = (0 until defaults.length).map { defaults.item(it) as Element }
            .filter { it.getAttribute("Extension").equals("bin", ignoreCase = true) }
        if (binDefaults.size > 1 || binDefaults.any { it.getAttribute("ContentType") != PRINTER_SETTINGS_CONTENT_TYPE }) {
            fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE)
        }
        val overrides = document.getElementsByTagNameNS(CONTENT_TYPES_NS, "Override")
        val binOverrides = (0 until overrides.length).map { overrides.item(it) as Element }
            .filter { it.getAttribute("PartName").endsWith(".bin", ignoreCase = true) }
        val overridePaths = binOverrides.map { it.getAttribute("PartName").removePrefix("/") }
        if (overridePaths.size != overridePaths.toSet().size ||
            binOverrides.any { it.getAttribute("ContentType") != PRINTER_SETTINGS_CONTENT_TYPE } ||
            overridePaths.any { it !in printerSettings } ||
            printerSettings.any { it !in overridePaths && binDefaults.isEmpty() }
        ) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_UNSAFE)
    }

    private fun readPptxSlides(presentation: Document, relationships: Document): PptxSlides {
        val slideTargetsById = relationshipTargets(relationships)
        val slideIds = presentation.getElementsByTagNameNS(PRESENTATION_NS, "sldId")
        val visible = mutableListOf<String>()
        val hidden = mutableSetOf<String>()
        repeat(slideIds.length) { index ->
            val slide = slideIds.item(index) as Element
            val relationshipId = slide.getAttributeNS(OFFICE_RELATIONSHIPS_NS, "id")
            val target = slideTargetsById[relationshipId]
                ?: fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
            val path = resolvePptTarget(PRESENTATION_PATH, target)
            if (slide.isHidden()) hidden += path else visible += path
        }
        val slideSize = presentation.getElementsByTagNameNS(PRESENTATION_NS, "sldSz").item(0) as? Element
        return PptxSlides(
            visible = visible,
            hidden = hidden,
            width = slideSize?.getAttribute("cx")?.toDoubleOrNull()?.div(12_700.0) ?: 960.0,
            height = slideSize?.getAttribute("cy")?.toDoubleOrNull()?.div(12_700.0) ?: 540.0,
        )
    }

    private fun Element.isHidden(): Boolean = getAttribute("show").lowercase() in setOf("0", "false", "off")

    private fun writeSanitizedPptx(
        entries: Map<String, ByteArray>,
        presentation: Document,
        removed: Set<String>,
    ): ByteArray {
        val output = ByteArrayOutputStream()
        ZipOutputStream(output).use { zip ->
            entries.forEach { (path, bytes) ->
                if (path !in removed) writeSanitizedPptxEntry(zip, path, bytes, presentation, removed)
            }
        }
        return output.toByteArray()
    }

    private fun writeSanitizedPptxEntry(
        zip: ZipOutputStream,
        path: String,
        bytes: ByteArray,
        presentation: Document,
        removed: Set<String>,
    ) {
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

    private fun readBoundedZip(bytes: ByteArray): LinkedHashMap<String, ByteArray> {
        val entries = linkedMapOf<String, ByteArray>()
        var expandedBytes = 0L
        var entryCount = 0
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                entryCount += 1
                if (entryCount > DOCUMENT_MAX_ZIP_ENTRIES) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED)
                expandedBytes = readZipEntry(zip, entry, entries, expandedBytes)
                zip.closeEntry()
            }
        }
        if (entries["[Content_Types].xml"] == null) fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        return entries
    }

    private fun readZipEntry(
        zip: ZipInputStream,
        entry: ZipEntry,
        entries: MutableMap<String, ByteArray>,
        initialExpandedBytes: Long,
    ): Long {
        val path = entry.name.replace('\\', '/')
        if (path.startsWith("/") || path.split('/').any { it == ".." } || entries.containsKey(path)) {
            fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        }
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var expandedBytes = initialExpandedBytes
        while (true) {
            val read = zip.read(buffer)
            if (read < 0) break
            expandedBytes += read
            if (expandedBytes > DOCUMENT_MAX_EXPANDED_BYTES) {
                fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED)
            }
            output.write(buffer, 0, read)
        }
        if (!entry.isDirectory) entries[path] = output.toByteArray()
        return expandedBytes
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
        normalizePackageNamespace(document, RELATIONSHIPS_NS, "Relationships")
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
        val defaults = document.getElementsByTagNameNS(CONTENT_TYPES_NS, "Default")
        val binDefaults = (0 until defaults.length).map { defaults.item(it) as Element }
            .filter { it.getAttribute("Extension").equals("bin", ignoreCase = true) }
        binDefaults.forEach { it.parentNode.removeChild(it) }
        normalizePackageNamespace(document, CONTENT_TYPES_NS, "Types")
        return serializeXml(document)
    }

    private fun requirePackageRoot(document: Document, namespace: String, localName: String) {
        val root = document.documentElement
        if (root.namespaceURI != namespace || root.localName != localName) {
            fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
        }
    }

    private fun normalizePackageNamespace(document: Document, namespace: String, localName: String) {
        requirePackageRoot(document, namespace, localName)
        fun normalize(element: Element) {
            val children = (0 until element.childNodes.length).mapNotNull { element.childNodes.item(it) as? Element }
            if (element.namespaceURI == namespace) document.renameNode(element, namespace, element.localName)
            children.forEach(::normalize)
        }
        normalize(document.documentElement)
        document.documentElement.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns", namespace)
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

private data class PptxSlides(
    val visible: List<String>,
    val hidden: Set<String>,
    val width: Double,
    val height: Double,
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
private const val PRINTER_SETTINGS_RELATIONSHIP = "$OFFICE_RELATIONSHIPS_NS/printerSettings"
private const val PRINTER_SETTINGS_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.printerSettings"
private val PRINTER_SETTINGS_PATH = Regex("ppt/printerSettings/printerSettings[0-9]+\\.bin")
private val URI_SCHEME = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:")
private val UNSAFE_RELATIONSHIP_TYPES = setOf("activexcontrol", "control", "externallink", "oleobject", "package", "vbaproject")
private val UNSAFE_CONTENT_TYPE_MARKERS = setOf("macroenabled", "vbaproject", "activex", "oleobject")
