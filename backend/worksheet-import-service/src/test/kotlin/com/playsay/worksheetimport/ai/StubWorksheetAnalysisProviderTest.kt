package com.playsay.worksheetimport.ai

import com.playsay.worksheetimport.domain.WorksheetInteractionType
import com.playsay.worksheetimport.domain.WorksheetPageDescriptor
import com.playsay.worksheetimport.domain.WorksheetPageRole
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.junit.jupiter.api.Test

class StubWorksheetAnalysisProviderTest {
    private val provider = StubWorksheetAnalysisProvider()
    private val validator = WorksheetAnalysisValidator(com.fasterxml.jackson.module.kotlin.jacksonObjectMapper().findAndRegisterModules())

    @Test
    fun `provides deterministic synthetic coverage for every supported fixture`() {
        val scenarios = listOf(
            "EXPLICIT_BLANK", "VISIBLE_WORD", "FORM_ENDING", "WORD_BANK", "MATCH_TEXT", "MATCH_IMAGE",
            "MULTIPLE_CHOICE", "FLASHCARD", "STATIC", "ANSWER_KEY",
        )
        val results = scenarios.mapIndexed { index, scenario -> analyze(index, scenario) }
        results.forEach(validator::validatePage)

        assertEquals(4, results.count { it.groups.singleOrNull()?.type == WorksheetInteractionType.FILL_GAPS })
        assertEquals(2, results.count { it.groups.singleOrNull()?.type == WorksheetInteractionType.MATCHING_PAIRS })
        assertNotNull(results.first { it.groups.singleOrNull()?.type == WorksheetInteractionType.MULTIPLE_CHOICE })
        assertNotNull(results.first { it.groups.singleOrNull()?.type == WorksheetInteractionType.FLASHCARDS })
        assertEquals(WorksheetPageRole.STATIC_REFERENCE, results[8].role)
        assertEquals(WorksheetPageRole.ANSWER_KEY, results[9].role)
    }

    @Test
    fun `links a single answer key without changing packet order`() {
        val worksheet = analyze(0, "EXPLICIT_BLANK")
        val key = analyze(1, "ANSWER_KEY")
        val packet = provider.resolvePacket(listOf(worksheet.pageId, key.pageId), listOf(worksheet, key))
        validator.validatePacket(packet, listOf(worksheet.pageId, key.pageId))
        assertEquals(key.pageId, packet.answerKeyAssociations.single().answerKeyPageId)
        assertTrue(packet.pages[1].groups.isEmpty())
    }

    private fun analyze(order: Int, scenario: String) = provider.analyzePage(
        WorksheetPageDescriptor(UUID.randomUUID(), UUID.randomUUID(), null, order, 1000, 1000, "private"),
        "WORKSHEET_FIXTURE:$scenario".toByteArray(),
        "image/png",
    )
}
