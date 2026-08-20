package com.playsay.vocabulary.util

import java.text.Normalizer
import java.util.Locale

data class LexicalSenseKey(
    val sourceLanguage: String,
    val targetLanguage: String,
    val normalizedLemma: String,
    val normalizedPartOfSpeech: String,
    val normalizedMeaning: String,
)

fun normalizeLexicalText(value: String, maxLength: Int): String =
    Normalizer.normalize(value, Normalizer.Form.NFKC)
        .lowercase(Locale.ROOT)
        .trim()
        .replace(Regex("\\s+"), " ")
        .take(maxLength)

fun lexicalSenseKey(
    sourceText: String,
    sourceLanguage: String,
    targetLanguage: String,
    translation: String?,
    partOfSpeech: String?,
): LexicalSenseKey? {
    val meaning = translation?.takeIf(String::isNotBlank)?.let { normalizeLexicalText(it, 500) } ?: return null
    return LexicalSenseKey(
        sourceLanguage = sourceLanguage.lowercase(Locale.ROOT),
        targetLanguage = targetLanguage.lowercase(Locale.ROOT),
        normalizedLemma = normalizeLexicalText(sourceText, 240),
        normalizedPartOfSpeech = partOfSpeech?.let { normalizeLexicalText(it, 80) }.orEmpty(),
        normalizedMeaning = meaning,
    )
}
