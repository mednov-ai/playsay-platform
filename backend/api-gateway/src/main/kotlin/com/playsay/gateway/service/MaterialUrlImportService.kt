package com.playsay.gateway.service

import java.io.InputStream
import java.net.IDN
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.Charset
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.Locale
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import com.playsay.gateway.dto.*
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData

data class ImportedMaterialUrlContent(
    val requestedUrl: String,
    val finalUrl: String,
    val title: String?,
    val description: String?,
    val text: String,
    val contentType: String?,
    val statusCode: Int,
)

@Component
class MaterialUrlImportService {
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build()

    fun fetch(url: String): ImportedMaterialUrlContent {
        val initialUri = validateImportUri(url)
        var currentUri = initialUri
        var response: HttpResponse<InputStream>? = null

        for (redirectCount in 0..materialUrlImportMaxRedirects) {
            response = fetchOnce(currentUri)
            if (!response.statusCode().isHttpRedirect()) {
                break
            }
            val redirectTarget = response.headers().firstValue("location").orElse(null)
                ?: throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.EXTERNAL_URL_REDIRECT_LOCATION_MISSING)
            response.body().close()
            currentUri = validateImportUri(currentUri.resolve(redirectTarget).toString())
            if (redirectCount == materialUrlImportMaxRedirects) {
                throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.EXTERNAL_URL_TOO_MANY_REDIRECTS)
            }
        }

        val finalResponse = requireNotNull(response)
        if (finalResponse.statusCode() !in 200..299) {
            finalResponse.body().close()
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.EXTERNAL_URL_HTTP_ERROR, finalResponse.statusCode())
        }

        val contentType = finalResponse.headers().firstValue("content-type").orElse(null)
        val mediaType = contentType?.substringBefore(";")?.trim()?.lowercase(Locale.ROOT).orEmpty()
        val looksReadable = mediaType.isEmpty() ||
            mediaType in setOf("text/html", "application/xhtml+xml", "text/plain")
        if (!looksReadable) {
            finalResponse.body().close()
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.EXTERNAL_URL_UNREADABLE_CONTENT_TYPE)
        }

        val bytes = finalResponse.body().use { body -> body.readLimitedBytes(materialUrlImportMaxBytes) }
        val charset = charsetFromContentType(contentType)
        val rawText = String(bytes, charset)
        val extracted = if (mediaType == "text/plain") {
            extractPlainText(rawText)
        } else {
            extractHtmlText(rawText)
        }

        if (extracted.text.length < 40) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.EXTERNAL_URL_NOT_ENOUGH_TEXT)
        }

        return ImportedMaterialUrlContent(
            requestedUrl = initialUri.toString(),
            finalUrl = currentUri.toString(),
            title = extracted.title,
            description = extracted.description,
            text = extracted.text.take(materialUrlImportMaxChars),
            contentType = contentType,
            statusCode = finalResponse.statusCode(),
        )
    }

    private fun fetchOnce(uri: URI): HttpResponse<InputStream> {
        validateImportUri(uri.toString())
        val request = HttpRequest.newBuilder(uri)
            .timeout(Duration.ofSeconds(25))
            .header("Accept", "text/html,application/xhtml+xml,text/plain;q=0.9")
            .header("User-Agent", "PlayAndSayMaterialImporter/1.0 (+https://play-and-say.ru)")
            .GET()
            .build()

        return try {
            httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream())
        } catch (exception: Exception) {
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.EXTERNAL_URL_READ_FAILED)
        }
    }
}

data class ExtractedMaterialUrlText(
    val title: String?,
    val description: String?,
    val text: String,
)

fun validateImportUri(rawUrl: String): URI {
    val uri = try {
        URI(rawUrl.trim())
    } catch (exception: Exception) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.EXTERNAL_URL_INVALID)
    }

    val scheme = uri.scheme?.lowercase(Locale.ROOT)
    if (scheme !in setOf("http", "https") || uri.userInfo != null) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.EXTERNAL_URL_UNSUPPORTED_SCHEME)
    }

    val host = uri.host?.trim()?.trimEnd('.')?.takeIf { value -> value.isNotEmpty() }
        ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.EXTERNAL_URL_HOST_INVALID)
    val asciiHost = try {
        IDN.toASCII(host).lowercase(Locale.ROOT)
    } catch (exception: Exception) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.EXTERNAL_URL_HOST_INVALID)
    }

    if (asciiHost == "localhost" || asciiHost.endsWith(".localhost") || asciiHost.endsWith(".local")) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.EXTERNAL_URL_HOST_NOT_ALLOWED)
    }

    val addresses = try {
        InetAddress.getAllByName(asciiHost)
    } catch (exception: Exception) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.EXTERNAL_URL_HOST_UNRESOLVED)
    }
    if (addresses.isEmpty() || addresses.any { address -> address.isPrivateImportAddress() }) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.EXTERNAL_URL_HOST_NOT_ALLOWED)
    }

    return uri
}

fun extractHtmlText(html: String): ExtractedMaterialUrlText {
    val title = materialUrlTitleRegex.find(html)?.groupValues?.get(1)?.let(::decodeHtmlEntities)?.let(::cleanOneLine)
    val description = materialUrlDescriptionRegex.find(html)?.groupValues?.get(1)?.let(::decodeHtmlEntities)?.let(::cleanOneLine)
    val readable = html
        .replace(materialUrlNoiseTagRegex, "\n")
        .replace(materialUrlBlockTagRegex, "\n")
        .replace(materialUrlAnyTagRegex, " ")
        .let(::decodeHtmlEntities)
        .lineSequence()
        .map(::cleanOneLine)
        .filter { line -> line.length >= 2 }
        .joinToString("\n")
        .replace(materialUrlBlankLinesRegex, "\n\n")
        .trim()
    return ExtractedMaterialUrlText(title = title, description = description, text = readable)
}

fun extractPlainText(text: String): ExtractedMaterialUrlText =
    ExtractedMaterialUrlText(
        title = text.lineSequence().firstOrNull { line -> line.isNotBlank() }?.let(::cleanOneLine)?.take(160),
        description = null,
        text = text
            .lineSequence()
            .map(::cleanOneLine)
            .filter { line -> line.isNotBlank() }
            .joinToString("\n")
            .trim(),
    )

private fun InputStream.readLimitedBytes(maxBytes: Int): ByteArray {
    val bytes = readNBytes(maxBytes + 1)
    if (bytes.size > maxBytes) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.EXTERNAL_URL_CONTENT_TOO_LARGE)
    }
    return bytes
}

private fun charsetFromContentType(contentType: String?): Charset {
    val charsetName = contentType
        ?.split(";")
        ?.firstNotNullOfOrNull { part ->
            val trimmed = part.trim()
            trimmed.substringAfter("charset=", missingDelimiterValue = "")
                .trim()
                .trim('"')
                .takeIf { value -> trimmed.startsWith("charset=", ignoreCase = true) && value.isNotEmpty() }
        }
    return charsetName?.let { name -> runCatching { Charset.forName(name) }.getOrNull() } ?: StandardCharsets.UTF_8
}

private fun InetAddress.isPrivateImportAddress(): Boolean {
    if (isAnyLocalAddress || isLoopbackAddress || isLinkLocalAddress || isSiteLocalAddress || isMulticastAddress) {
        return true
    }
    return when (this) {
        is Inet4Address -> {
            val bytes = address.map { value -> value.toInt() and 0xff }
            bytes[0] == 0 ||
                bytes[0] == 10 ||
                bytes[0] == 127 ||
                (bytes[0] == 169 && bytes[1] == 254) ||
                (bytes[0] == 172 && bytes[1] in 16..31) ||
                (bytes[0] == 192 && bytes[1] == 168)
        }
        is Inet6Address -> {
            val first = address[0].toInt() and 0xff
            first == 0 || first == 0xfc || first == 0xfd || first == 0xfe
        }
    }
}

private fun cleanOneLine(value: String): String =
    value.replace(Regex("""\s+"""), " ").trim()

private fun decodeHtmlEntities(value: String): String =
    value
        .replace("&nbsp;", " ", ignoreCase = true)
        .replace("&amp;", "&", ignoreCase = true)
        .replace("&lt;", "<", ignoreCase = true)
        .replace("&gt;", ">", ignoreCase = true)
        .replace("&quot;", "\"", ignoreCase = true)
        .replace("&#39;", "'", ignoreCase = true)
        .replace("&#x27;", "'", ignoreCase = true)
        .replace(materialUrlDecimalEntityRegex) { match -> decodeHtmlCodepoint(match.groupValues[1].toIntOrNull()) }
        .replace(materialUrlHexEntityRegex) { match -> decodeHtmlCodepoint(match.groupValues[1].toIntOrNull(16)) }

private fun decodeHtmlCodepoint(codepoint: Int?): String =
    codepoint
        ?.takeIf { value -> value in 0x20..0x10ffff }
        ?.let { value -> runCatching { String(Character.toChars(value)) }.getOrNull() }
        ?: " "

private fun Int.isHttpRedirect(): Boolean = this in 300..399

private const val materialUrlImportMaxBytes = 1_000_000
private const val materialUrlImportMaxChars = 12_000
private const val materialUrlImportMaxRedirects = 4

private val materialUrlTitleRegex = Regex("""(?is)<title[^>]*>(.*?)</title>""")
private val materialUrlDescriptionRegex =
    Regex("""(?is)<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>""")
private val materialUrlNoiseTagRegex =
    Regex("""(?is)<(script|style|noscript|svg|canvas|iframe|nav|header|footer|form|aside)[^>]*>.*?</\1>""")
private val materialUrlBlockTagRegex =
    Regex("""(?is)</?(p|div|section|article|main|br|li|ul|ol|h[1-6]|tr|td|th|blockquote|pre)[^>]*>""")
private val materialUrlAnyTagRegex = Regex("""(?is)<[^>]+>""")
private val materialUrlBlankLinesRegex = Regex("""\n{3,}""")
private val materialUrlDecimalEntityRegex = Regex("""&#(\d{1,7});""")
private val materialUrlHexEntityRegex = Regex("""&#x([0-9a-fA-F]{1,6});""")
