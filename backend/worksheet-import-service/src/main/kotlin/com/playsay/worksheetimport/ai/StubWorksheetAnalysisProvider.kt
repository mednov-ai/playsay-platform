package com.playsay.worksheetimport.ai

import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.NormalizedRegion
import com.playsay.worksheetimport.domain.ReviewedValue
import com.playsay.worksheetimport.domain.WorksheetAnswerKeyAssociation
import com.playsay.worksheetimport.domain.WorksheetAnswerProvenance
import com.playsay.worksheetimport.domain.WorksheetCardSide
import com.playsay.worksheetimport.domain.WorksheetChoiceOption
import com.playsay.worksheetimport.domain.WorksheetContentKind
import com.playsay.worksheetimport.domain.WorksheetFlashcard
import com.playsay.worksheetimport.domain.WorksheetGapItem
import com.playsay.worksheetimport.domain.WorksheetGapMode
import com.playsay.worksheetimport.domain.WorksheetInteractionGroup
import com.playsay.worksheetimport.domain.WorksheetInteractionType
import com.playsay.worksheetimport.domain.WorksheetMultipleChoiceItem
import com.playsay.worksheetimport.domain.WorksheetPacketResolution
import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageDescriptor
import com.playsay.worksheetimport.domain.WorksheetPageRole
import com.playsay.worksheetimport.domain.WorksheetPair
import com.playsay.worksheetimport.domain.WorksheetPairEndpoint
import com.playsay.worksheetimport.domain.WorksheetRegionAnchor
import com.playsay.worksheetimport.domain.WorksheetSectionType
import java.util.UUID
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component

@Component
class StubWorksheetAnalysisProvider : WorksheetAnalysisProvider {
    override fun analyzePage(page: WorksheetPageDescriptor, rasterBytes: ByteArray, mimeType: String): WorksheetPageAnalysis {
        val marker = rasterBytes.copyOfRange(0, minOf(rasterBytes.size, 160)).toString(Charsets.UTF_8)
        val scenario = Regex("WORKSHEET_FIXTURE:([A-Z_]+)").find(marker)?.groupValues?.get(1) ?: "STATIC"
        return fixture(page.id, scenario)
    }

    override fun resolvePacket(orderedPageIds: List<UUID>, analyses: List<WorksheetPageAnalysis>): WorksheetPacketResolution {
        require(orderedPageIds == analyses.map { it.pageId })
        val keys = analyses.filter { it.role == WorksheetPageRole.ANSWER_KEY }
        val associations = if (keys.size == 1) {
            analyses.filter { it.role == WorksheetPageRole.WORKSHEET }
                .map { WorksheetAnswerKeyAssociation(it.pageId, keys.single().pageId, 1.0) }
        } else emptyList()
        return WorksheetPacketResolution(orderedPageIds = orderedPageIds, pages = analyses, answerKeyAssociations = associations)
    }

    internal fun fixture(pageId: UUID, scenario: String): WorksheetPageAnalysis = when (scenario) {
        "EXPLICIT_BLANK" -> page(pageId, WorksheetSectionType.TYPED_GAPS, gapGroup(WorksheetGapMode.TYPED, null))
        "VISIBLE_WORD" -> page(pageId, WorksheetSectionType.TYPED_GAPS, gapGroup(WorksheetGapMode.TYPED, "is", WorksheetAnswerProvenance.VISIBLE_TEXT))
        "FORM_ENDING" -> page(pageId, WorksheetSectionType.FORM_TRANSFORM, gapGroup(WorksheetGapMode.FORM_TRANSFORM, "went", baseForm = "go"))
        "WORD_BANK" -> page(pageId, WorksheetSectionType.WORD_BANK_GAPS, gapGroup(WorksheetGapMode.WORD_BANK, "are", wordBank = listOf("am", "is", "are")))
        "MATCH_TEXT" -> page(pageId, WorksheetSectionType.MATCHING_TEXT_TEXT, matching(false))
        "MATCH_IMAGE" -> page(pageId, WorksheetSectionType.MATCHING_TEXT_IMAGE, matching(true))
        "MULTIPLE_CHOICE" -> page(pageId, WorksheetSectionType.MULTIPLE_CHOICE, multipleChoice())
        "FLASHCARD" -> page(pageId, WorksheetSectionType.FLASHCARDS, flashcards())
        "ANSWER_KEY" -> static(pageId, WorksheetPageRole.ANSWER_KEY)
        else -> static(pageId, WorksheetPageRole.STATIC_REFERENCE)
    }

    private fun static(id: UUID, role: WorksheetPageRole) = WorksheetPageAnalysis(
        pageId = id, role = role, roleConfidence = 1.0,
        sections = listOf(WorksheetSectionType.STATIC_CONTENT), words = emptyList(), groups = emptyList(),
    )

    private fun page(id: UUID, section: WorksheetSectionType, group: WorksheetInteractionGroup) = WorksheetPageAnalysis(
        pageId = id, role = WorksheetPageRole.WORKSHEET, roleConfidence = 1.0,
        sections = listOf(section), words = emptyList(), groups = listOf(group),
    )

    private fun gapGroup(
        mode: WorksheetGapMode,
        answer: String?,
        provenance: WorksheetAnswerProvenance = WorksheetAnswerProvenance.AI_INFERENCE,
        baseForm: String? = null,
        wordBank: List<String> = emptyList(),
    ) = WorksheetInteractionGroup(
        id = "group-1", order = 0, type = WorksheetInteractionType.FILL_GAPS, gapMode = mode,
        gaps = listOf(
            WorksheetGapItem(
                id = "gap-1", region = region(200, 200),
                answer = answer?.let { ReviewedValue(it, provenance, 1.0, provenance != WorksheetAnswerProvenance.AI_INFERENCE) },
                acceptedAnswers = answer?.let(::listOf).orEmpty(), options = wordBank, baseForm = baseForm,
                distractors = wordBank.filterNot { it == answer }.map { ReviewedValue(it, WorksheetAnswerProvenance.AI_INFERENCE, 1.0, false) },
            ),
        ),
        wordBank = wordBank,
    )

    private fun matching(image: Boolean) = WorksheetInteractionGroup(
        id = "group-1", order = 0, type = WorksheetInteractionType.MATCHING_PAIRS,
        pairs = listOf(
            WorksheetPair(
                "pair-1", 1,
                WorksheetPairEndpoint(region(100, 200), WorksheetContentKind.TEXT, text = "cat"),
                if (image) WorksheetPairEndpoint(region(650, 200), WorksheetContentKind.IMAGE, imageAlt = "cat illustration")
                else WorksheetPairEndpoint(region(650, 200), WorksheetContentKind.TEXT, text = "кот"),
            ),
        ),
    )

    private fun multipleChoice() = WorksheetInteractionGroup(
        id = "group-1", order = 0, type = WorksheetInteractionType.MULTIPLE_CHOICE,
        questions = listOf(
            WorksheetMultipleChoiceItem(
                id = "question-1", prompt = "Choose the correct answer", promptRegion = region(100, 100),
                options = listOf("am", "is", "are").mapIndexed { index, value ->
                    WorksheetChoiceOption("option-$index", index, region(150, 250 + index * 100), value, WorksheetAnswerProvenance.AI_INFERENCE, 1.0, false)
                },
                correctOptionIds = setOf("option-1"),
            ),
        ),
    )

    private fun flashcards() = WorksheetInteractionGroup(
        id = "group-1", order = 0, type = WorksheetInteractionType.FLASHCARDS,
        cards = listOf(
            WorksheetFlashcard(
                "card-1", 0,
                WorksheetCardSide(WorksheetContentKind.TEXT, text = "cat", provenance = WorksheetAnswerProvenance.VISIBLE_TEXT, confidence = 1.0, confirmed = true),
                WorksheetCardSide(WorksheetContentKind.IMAGE, region = region(600, 200), provenance = WorksheetAnswerProvenance.VISIBLE_TEXT, confidence = 1.0, confirmed = true),
            ),
        ),
    )

    private fun region(x: Int, y: Int) = NormalizedRegion(x, y, 150, 70, WorksheetRegionAnchor.GEOMETRY)
}

@Component
@Primary
class WorksheetAnalysisProviderRouter(
    private val properties: WorksheetImportProperties,
    private val stub: StubWorksheetAnalysisProvider,
    private val openAi: OpenAiWorksheetAnalysisProvider,
) : WorksheetAnalysisProvider {
    private val delegate get() = when (properties.analysis.provider) {
        "stub" -> stub
        "openai" -> openAi
        else -> throw WorksheetAnalysisProviderException()
    }

    override fun analyzePage(page: WorksheetPageDescriptor, rasterBytes: ByteArray, mimeType: String) = delegate.analyzePage(page, rasterBytes, mimeType)
    override fun resolvePacket(orderedPageIds: List<UUID>, analyses: List<WorksheetPageAnalysis>) = delegate.resolvePacket(orderedPageIds, analyses)
}
