package com.playsay.vocabulary.util

import com.playsay.vocabulary.entity.VocabularyEntryEntity

fun cleanVocabularySubject(subject: String?): String? =
    subject?.trim()?.takeIf(String::isNotEmpty)?.take(255)

fun hasExactVocabularyContext(entry: VocabularyEntryEntity): Boolean {
    val example = entry.example?.trim().orEmpty()
    val sourceText = entry.sourceText.trim()
    if (example.isEmpty() || sourceText.isEmpty()) return false
    val exactForm = "(?<![\\p{L}\\p{N}'’-])${Regex.escape(sourceText)}(?![\\p{L}\\p{N}'’-])"
    return Regex(exactForm, RegexOption.IGNORE_CASE).containsMatchIn(example)
}

fun maskedVocabularyHint(answer: String): String {
    var revealNext = true
    return answer.trim().map { character ->
        when {
            character.isWhitespace() -> {
                revealNext = true
                character
            }
            revealNext -> {
                revealNext = false
                character
            }
            else -> '•'
        }
    }.joinToString("")
}
