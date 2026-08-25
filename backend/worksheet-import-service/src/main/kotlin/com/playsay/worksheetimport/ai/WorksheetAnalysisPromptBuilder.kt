package com.playsay.worksheetimport.ai

import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageDescriptor
import java.util.UUID
import org.springframework.stereotype.Component

@Component
class WorksheetAnalysisPromptBuilder {
    fun pageSystemPrompt(): String = """
        You analyze one photographed or scanned worksheet page for faithful interactive overlay import.
        Return only the requested worksheet-analysis/v1 JSON. Never create, rewrite, translate, simplify, or add activities.
        Preserve visible content and reading order. Classify the page as WORKSHEET, ANSWER_KEY, or STATIC_REFERENCE.
        Supported learner interactions are fill gaps, matching pairs, standalone multiple choice, and flashcards.
        Keep every unsupported or uncertain learner page as STATIC_CONTENT; never drop it.
        Use normalized integer coordinates from 0 to 1000. OCR text must be a literal transcription, not a correction.
        Printed blanks are gap regions. If a visible word is clearly intended to be hidden, preserve it as VISIBLE_TEXT answer provenance.
        Do not infer extra questions from an illustration. Do not treat attribution or watermarks as exercises.
    """.trimIndent()

    fun pageUserPrompt(page: WorksheetPageDescriptor): String = """
        Analyze packet page ${page.order + 1} with pageId ${page.id}.
        Source page number: ${page.sourcePageNumber ?: "single image"}.
        Raster dimensions: ${page.width}x${page.height}.
        Return this exact pageId and worksheet-analysis/v1 schemaVersion.
    """.trimIndent()

    fun packetSystemPrompt(): String = """
        Reconcile already validated worksheet-analysis/v1 page results for one packet.
        Return only the requested packet JSON. Preserve the exact supplied page order and every page exactly once.
        Resolve page roles and associate answer keys only when supported by visible correspondence.
        Do not invent blocks, answers, options, distractors, cards, or pages. A key may be teacher-only; unsupported pages remain static.
    """.trimIndent()

    fun packetUserPrompt(orderedPageIds: List<UUID>, analyses: List<WorksheetPageAnalysis>): String {
        require(orderedPageIds == analyses.map { it.pageId })
        val summaries = analyses.joinToString("\n") { page ->
            "${page.pageId}|role=${page.role}|sections=${page.sections.joinToString(",")}|groups=${page.groups.size}"
        }
        return """
            Required order: ${orderedPageIds.joinToString(",")}
            Validated page summaries in that same order:
            $summaries
            Return orderedPageIds unchanged and include each supplied page result without adding activities.
        """.trimIndent()
    }
}
