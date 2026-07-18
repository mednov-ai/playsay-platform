package com.playsay.gateway.service

import java.nio.charset.StandardCharsets
import org.jsoup.Jsoup
import org.springframework.stereotype.Component

data class MaterialHtmlGameMetadata(
    val title: String,
    val displayTitle: String,
    val titleSource: String,
    val titleNeedsAi: Boolean,
    val context: String,
)

@Component
class MaterialHtmlGameMetadataService {
    fun extract(bytes: ByteArray, originalFileName: String?): MaterialHtmlGameMetadata {
        val document = Jsoup.parse(String(bytes, StandardCharsets.UTF_8))
        val candidates = listOf(
            "HTML" to document.title(),
            "HTML" to document.selectFirst("meta[name=application-name]")?.attr("content"),
            "HTML" to document.selectFirst("meta[property=og:title]")?.attr("content"),
            "HTML" to document.selectFirst("h1")?.text(),
            "FILE" to originalFileName?.substringBeforeLast('.', originalFileName),
        )
        val selected = candidates.firstNotNullOfOrNull { (source, value) ->
            cleanTitle(value)?.let { title -> source to title }
        } ?: ("FILE" to "HTML game")
        val context = document
            .select("title, meta[name=description], h1, h2, p, button, label")
            .map { element -> if (element.tagName() == "meta") element.attr("content") else element.text() }
            .joinToString("\n")
            .replace(Regex("""\s+"""), " ")
            .trim()
            .take(8_000)
        val titleNeedsAi = isWeakTitle(selected.second) || !MaterialHtmlGameTitlePolicy.isEnglish(selected.second)
        return MaterialHtmlGameMetadata(
            title = selected.second,
            displayTitle = if (titleNeedsAi) MaterialHtmlGameTitlePolicy.FALLBACK_TITLE else selected.second,
            titleSource = selected.first,
            titleNeedsAi = titleNeedsAi,
            context = context,
        )
    }

    private fun cleanTitle(value: String?): String? =
        value
            ?.replace(Regex("""\s+"""), " ")
            ?.trim()
            ?.take(160)
            ?.takeIf { title -> title.isNotEmpty() }

    private fun isWeakTitle(title: String): Boolean {
        val normalized = title.lowercase().trim()
        return normalized.length < 3 ||
            normalized.length > 80 ||
            normalized.matches(Regex("(?:index|untitled|game|html game|\\u0438\\u0433\\u0440\\u0430|html)[-_. ]*\\d*")) ||
            normalized.endsWith(".html")
    }
}
