package com.playsay.worksheetimport.ai

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.worksheetimport.domain.NormalizedRegion
import com.playsay.worksheetimport.domain.WORKSHEET_ANALYSIS_SCHEMA_VERSION
import com.playsay.worksheetimport.domain.WorksheetCardSide
import com.playsay.worksheetimport.domain.WorksheetContentKind
import com.playsay.worksheetimport.domain.WorksheetInteractionGroup
import com.playsay.worksheetimport.domain.WorksheetInteractionType
import com.playsay.worksheetimport.domain.WorksheetPacketResolution
import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageRole
import com.playsay.worksheetimport.domain.WorksheetPairEndpoint
import java.nio.charset.StandardCharsets
import java.util.UUID
import org.springframework.stereotype.Component

class InvalidWorksheetAnalysisException : RuntimeException("Worksheet analysis output is invalid.")

@Component
class WorksheetAnalysisValidator(
    objectMapper: ObjectMapper,
) {
    private val strictMapper = objectMapper.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)

    fun parsePage(raw: String, expectedPageId: UUID): WorksheetPageAnalysis {
        requireBounded(raw)
        val analysis = runCatching { strictMapper.readValue(raw, WorksheetPageAnalysis::class.java) }
            .getOrElse { throw InvalidWorksheetAnalysisException() }
        validatePage(analysis, expectedPageId)
        return analysis
    }

    fun parsePacket(raw: String, expectedPageIds: List<UUID>): WorksheetPacketResolution {
        requireBounded(raw)
        val resolution = runCatching { strictMapper.readValue(raw, WorksheetPacketResolution::class.java) }
            .getOrElse { throw InvalidWorksheetAnalysisException() }
        validatePacket(resolution, expectedPageIds)
        return resolution
    }

    fun validatePage(page: WorksheetPageAnalysis, expectedPageId: UUID = page.pageId) {
        valid(page.schemaVersion == WORKSHEET_ANALYSIS_SCHEMA_VERSION)
        valid(page.pageId == expectedPageId)
        confidence(page.roleConfidence)
        valid(page.sections.distinct().size == page.sections.size && page.sections.size <= 100)
        valid(page.words.size <= 5_000 && page.groups.size <= 100)
        unique(page.words.map { it.id })
        page.words.forEach { word ->
            text(word.text, 500, allowEmpty = false)
            region(word.region)
            confidence(word.confidence)
        }
        unique(page.groups.map { it.id })
        page.groups.forEach(::group)
        if (page.role != WorksheetPageRole.WORKSHEET) valid(page.groups.isEmpty())
    }

    fun validatePacket(packet: WorksheetPacketResolution, expectedPageIds: List<UUID>) {
        valid(packet.schemaVersion == WORKSHEET_ANALYSIS_SCHEMA_VERSION)
        valid(packet.orderedPageIds == expectedPageIds && expectedPageIds.isNotEmpty() && expectedPageIds.size <= 200)
        unique(packet.orderedPageIds.map(UUID::toString))
        valid(packet.pages.map { it.pageId } == expectedPageIds)
        packet.pages.forEach { validatePage(it, it.pageId) }
        unique(packet.answerKeyAssociations.map { "${it.worksheetPageId}:${it.answerKeyPageId}" })
        val byId = packet.pages.associateBy { it.pageId }
        packet.answerKeyAssociations.forEach { association ->
            valid(association.worksheetPageId != association.answerKeyPageId)
            valid(byId[association.worksheetPageId]?.role == WorksheetPageRole.WORKSHEET)
            valid(byId[association.answerKeyPageId]?.role == WorksheetPageRole.ANSWER_KEY)
            confidence(association.confidence)
        }
    }

    @Suppress("CyclomaticComplexMethod", "LongMethod")
    private fun group(group: WorksheetInteractionGroup) {
        text(group.id, 120, false)
        valid(group.order >= 0)
        valid(group.wordBank.size <= 300)
        group.wordBank.forEach { text(it, 500, false) }
        when (group.type) {
            WorksheetInteractionType.FILL_GAPS -> {
                valid(group.gapMode != null && group.gaps.isNotEmpty() && group.pairs.isEmpty() && group.questions.isEmpty() && group.cards.isEmpty())
                valid(group.gaps.size <= 200)
                unique(group.gaps.map { it.id })
                group.gaps.forEach { gap ->
                    text(gap.id, 120, false)
                    region(gap.region)
                    gap.prompt?.let { text(it, 1_000, true) }
                    gap.answer?.let { answer ->
                        text(answer.value, 500, true)
                        confidence(answer.confidence)
                    }
                    valid(gap.acceptedAnswers.size <= 20 && gap.options.size <= 50)
                    gap.acceptedAnswers.forEach { text(it, 500, false) }
                    gap.options.forEach { text(it, 500, false) }
                    valid(gap.distractors.size <= 50)
                    gap.distractors.forEach { distractor ->
                        text(distractor.value, 500, false)
                        confidence(distractor.confidence)
                    }
                }
            }
            WorksheetInteractionType.MATCHING_PAIRS -> {
                valid(group.gapMode == null && group.gaps.isEmpty() && group.pairs.isNotEmpty() && group.questions.isEmpty() && group.cards.isEmpty())
                valid(group.pairs.size <= 100)
                unique(group.pairs.map { it.id })
                unique(group.pairs.map { it.number.toString() })
                group.pairs.forEach { pair -> valid(pair.number > 0); endpoint(pair.left); endpoint(pair.right) }
            }
            WorksheetInteractionType.MULTIPLE_CHOICE -> {
                valid(group.gapMode == null && group.gaps.isEmpty() && group.pairs.isEmpty() && group.questions.isNotEmpty() && group.cards.isEmpty())
                valid(group.questions.size <= 100)
                unique(group.questions.map { it.id })
                group.questions.forEach { question ->
                    text(question.prompt, 2_000, false)
                    question.promptRegion?.let(::region)
                    valid(question.options.size in 2..20)
                    unique(question.options.map { it.id })
                    valid(question.options.map { it.order } == question.options.indices.toList())
                    val optionIds = question.options.map { it.id }.toSet()
                    valid(question.correctOptionIds.isNotEmpty() && question.correctOptionIds.all(optionIds::contains))
                    question.options.forEach { option ->
                        text(option.text, 1_000, false)
                        option.region?.let(::region)
                        confidence(option.confidence)
                    }
                }
            }
            WorksheetInteractionType.FLASHCARDS -> {
                valid(group.gapMode == null && group.gaps.isEmpty() && group.pairs.isEmpty() && group.questions.isEmpty() && group.cards.isNotEmpty())
                valid(group.cards.size <= 100)
                unique(group.cards.map { it.id })
                valid(group.cards.map { it.order } == group.cards.indices.toList())
                group.cards.forEach { card -> side(card.front); side(card.back) }
            }
        }
    }

    private fun endpoint(endpoint: WorksheetPairEndpoint) {
        region(endpoint.region)
        when (endpoint.kind) {
            WorksheetContentKind.TEXT -> valid(!endpoint.text.isNullOrBlank())
            WorksheetContentKind.IMAGE -> valid(endpoint.region.width > 0 && endpoint.region.height > 0)
        }
        endpoint.text?.let { text(it, 1_000, false) }
        endpoint.imageAlt?.let { text(it, 500, true) }
    }

    private fun side(side: WorksheetCardSide) {
        confidence(side.confidence)
        when (side.kind) {
            WorksheetContentKind.TEXT -> valid(!side.text.isNullOrBlank())
            WorksheetContentKind.IMAGE -> valid(side.region != null)
        }
        side.text?.let { text(it, 2_000, false) }
        side.region?.let(::region)
    }

    private fun region(region: NormalizedRegion) {
        valid(region.x in 0..999 && region.y in 0..999)
        valid(region.width in 1..1_000 && region.height in 1..1_000)
        valid(region.x + region.width <= 1_000 && region.y + region.height <= 1_000)
        region.anchorId?.let { text(it, 120, false) }
    }

    private fun confidence(value: Double) = valid(value.isFinite() && value in 0.0..1.0)
    private fun unique(values: List<String>) = valid(values.distinct().size == values.size)
    private fun text(value: String, max: Int, allowEmpty: Boolean) = valid(value.length <= max && (allowEmpty || value.isNotBlank()))
    private fun requireBounded(raw: String) = valid(raw.toByteArray(StandardCharsets.UTF_8).size in 2..MAX_OUTPUT_BYTES)
    private fun valid(condition: Boolean) {
        if (!condition) throw InvalidWorksheetAnalysisException()
    }

    private companion object {
        const val MAX_OUTPUT_BYTES = 4 * 1024 * 1024
    }
}
