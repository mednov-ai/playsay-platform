package com.playsay.worksheetimport.ai

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.worksheetimport.domain.NormalizedRegion
import com.playsay.worksheetimport.domain.WorksheetAnswerKeyAssociation
import com.playsay.worksheetimport.domain.WorksheetAnswerProvenance
import com.playsay.worksheetimport.domain.WorksheetChoiceOption
import com.playsay.worksheetimport.domain.WorksheetInteractionGroup
import com.playsay.worksheetimport.domain.WorksheetInteractionType
import com.playsay.worksheetimport.domain.WorksheetMultipleChoiceItem
import com.playsay.worksheetimport.domain.WorksheetPacketResolution
import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageRole
import com.playsay.worksheetimport.domain.WorksheetSectionType
import java.util.UUID
import kotlin.test.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class WorksheetAnalysisValidatorTest {
    private val mapper = jacksonObjectMapper().findAndRegisterModules()
    private val validator = WorksheetAnalysisValidator(mapper)

    @Test
    fun `accepts ordered multiple choice packet and key association`() {
        val worksheetId = UUID.randomUUID()
        val keyId = UUID.randomUUID()
        val worksheet = page(worksheetId, WorksheetPageRole.WORKSHEET, listOf(multipleChoice()))
        val key = page(keyId, WorksheetPageRole.ANSWER_KEY, emptyList())
        val packet = WorksheetPacketResolution(
            orderedPageIds = listOf(worksheetId, keyId),
            pages = listOf(worksheet, key),
            answerKeyAssociations = listOf(WorksheetAnswerKeyAssociation(worksheetId, keyId, 0.9)),
        )

        validator.validatePacket(packet, listOf(worksheetId, keyId))
        assertEquals(packet, validator.parsePacket(mapper.writeValueAsString(packet), listOf(worksheetId, keyId)))
    }

    @Test
    fun `rejects bounds unknown fields invalid references and reordered pages`() {
        val id = UUID.randomUUID()
        val invalidBounds = page(id, WorksheetPageRole.WORKSHEET, listOf(multipleChoice(region = NormalizedRegion(900, 0, 200, 10))))
        assertThrows<InvalidWorksheetAnalysisException> { validator.validatePage(invalidBounds) }

        val rawWithUnknown = mapper.writeValueAsString(page(id, WorksheetPageRole.STATIC_REFERENCE, emptyList())).dropLast(1) + ",\"secret\":true}"
        assertThrows<InvalidWorksheetAnalysisException> { validator.parsePage(rawWithUnknown, id) }

        val first = page(id, WorksheetPageRole.STATIC_REFERENCE, emptyList())
        val secondId = UUID.randomUUID()
        val second = page(secondId, WorksheetPageRole.STATIC_REFERENCE, emptyList())
        val reordered = WorksheetPacketResolution(orderedPageIds = listOf(secondId, id), pages = listOf(second, first), answerKeyAssociations = emptyList())
        assertThrows<InvalidWorksheetAnalysisException> { validator.validatePacket(reordered, listOf(id, secondId)) }
    }

    private fun page(id: UUID, role: WorksheetPageRole, groups: List<WorksheetInteractionGroup>) = WorksheetPageAnalysis(
        pageId = id,
        role = role,
        roleConfidence = 0.9,
        sections = if (groups.isEmpty()) listOf(WorksheetSectionType.STATIC_CONTENT) else listOf(WorksheetSectionType.MULTIPLE_CHOICE),
        words = emptyList(),
        groups = groups,
    )

    private fun multipleChoice(region: NormalizedRegion = NormalizedRegion(10, 10, 100, 30)): WorksheetInteractionGroup {
        val options = listOf("Yes", "No").mapIndexed { index, text ->
            WorksheetChoiceOption("o$index", index, region, text, WorksheetAnswerProvenance.AI_INFERENCE, 0.9, false)
        }
        return WorksheetInteractionGroup(
            id = "g1", order = 0, type = WorksheetInteractionType.MULTIPLE_CHOICE,
            questions = listOf(WorksheetMultipleChoiceItem("q1", "Choose", region, options, setOf("o0"))),
        )
    }
}
