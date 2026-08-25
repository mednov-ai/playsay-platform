package com.playsay.worksheetimport.ai

import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageDescriptor
import com.playsay.worksheetimport.domain.WorksheetPageRole
import com.playsay.worksheetimport.domain.WorksheetSectionType
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import org.junit.jupiter.api.Test

class WorksheetAnalysisPromptBuilderTest {
    private val builder = WorksheetAnalysisPromptBuilder()

    @Test
    fun `prompts require faithful supported-only analysis and preserve page identity`() {
        val id = UUID.randomUUID()
        val descriptor = WorksheetPageDescriptor(id, UUID.randomUUID(), 3, 5, 1200, 800, "private")
        val pagePrompt = builder.pageSystemPrompt() + builder.pageUserPrompt(descriptor)
        assertTrue("Never create" in pagePrompt)
        assertTrue("STATIC_CONTENT" in pagePrompt)
        assertTrue(id.toString() in pagePrompt)
        assertTrue("Source page number: 3" in pagePrompt)
    }

    @Test
    fun `packet prompt rejects reordered summaries`() {
        val ids = listOf(UUID.randomUUID(), UUID.randomUUID())
        val analyses = ids.map { id ->
            WorksheetPageAnalysis(pageId = id, role = WorksheetPageRole.STATIC_REFERENCE, roleConfidence = 1.0, sections = listOf(WorksheetSectionType.STATIC_CONTENT), words = emptyList(), groups = emptyList())
        }
        val prompt = builder.packetUserPrompt(ids, analyses)
        assertTrue(prompt.indexOf(ids[0].toString()) < prompt.lastIndexOf(ids[1].toString()))
        assertFailsWith<IllegalArgumentException> { builder.packetUserPrompt(ids.reversed(), analyses) }
        assertEquals(2, prompt.lines().count { line -> line.contains("|role=") })
    }
}
