package com.playsay.vocabulary.service

internal fun validatedOpenAiReasoningEffort(value: String, fallback: String): String {
    val normalized = value.trim().lowercase().ifEmpty { fallback }
    require(normalized in OPENAI_REASONING_EFFORTS) {
        "Unsupported OpenAI reasoning effort '$value'. Allowed values: ${OPENAI_REASONING_EFFORTS.joinToString(", ")}"
    }
    return normalized
}

private val OPENAI_REASONING_EFFORTS = linkedSetOf("none", "low", "medium", "high", "xhigh", "max")
