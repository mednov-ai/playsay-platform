package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.TranslationSuggestionResponse

interface TranslationProvider {
    fun suggest(sourceText: String, sourceLanguage: String, targetLanguage: String, context: String?): TranslationSuggestionResponse
}
