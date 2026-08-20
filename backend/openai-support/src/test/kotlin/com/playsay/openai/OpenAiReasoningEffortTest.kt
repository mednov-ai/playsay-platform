package com.playsay.openai

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class OpenAiReasoningEffortTest {
    @Test
    fun `normalizes every supported provider value`() {
        listOf("none", "low", "medium", "high", "xhigh", "max").forEach { effort ->
            assertEquals(effort, validatedOpenAiReasoningEffort("  ${effort.uppercase()}  ", "medium"))
        }
    }

    @Test
    fun `uses fallback only for a blank configured value`() {
        assertEquals("medium", validatedOpenAiReasoningEffort("  ", "medium"))
    }

    @Test
    fun `rejects unsupported provider values`() {
        val error = assertFailsWith<IllegalArgumentException> {
            validatedOpenAiReasoningEffort("minimal", "medium")
        }

        assertTrue(error.message.orEmpty().contains("Unsupported OpenAI reasoning effort 'minimal'"))
    }
}
