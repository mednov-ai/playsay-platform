package com.playsay.worksheetimport.service

import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.ReviewedValue
import com.playsay.worksheetimport.domain.WorksheetAnswerProvenance
import com.playsay.worksheetimport.domain.WorksheetBlockerCode
import com.playsay.worksheetimport.domain.WorksheetContentKind
import com.playsay.worksheetimport.domain.WorksheetGapMode
import com.playsay.worksheetimport.domain.WorksheetInteractionType
import com.playsay.worksheetimport.domain.WorksheetRegionAnchor
import com.playsay.worksheetimport.domain.WorksheetReview
import com.playsay.worksheetimport.domain.WorksheetReviewBlocker
import org.springframework.stereotype.Component

@Component
class WorksheetReviewCanonicalizer {
    fun merge(proposal: WorksheetReview?, submitted: WorksheetReview): WorksheetReview {
        if (proposal == null) return submitted
        val proposedPages = proposal.pages.associateBy { it.id }
        return submitted.copy(
            pages = submitted.pages.map { page ->
                val proposedGroups = proposedPages[page.id]?.groups.orEmpty().associateBy { it.id }
                page.copy(groups = page.groups.map { group ->
                    val proposedGaps = proposedGroups[group.id]?.gaps.orEmpty().associateBy { it.id }
                    group.copy(gaps = group.gaps.map { gap ->
                        val proposed = proposedGaps[gap.id]
                        gap.copy(
                            answer = chooseAnswer(
                                listOfNotNull(gap.answer, proposed?.answer),
                                gap.answer?.takeIf { it.provenance == WorksheetAnswerProvenance.TEACHER },
                            ),
                        )
                    })
                })
            },
        )
    }

    fun chooseAnswer(candidates: List<ReviewedValue>, teacherOverride: ReviewedValue? = null): ReviewedValue? =
        teacherOverride ?: candidates.filter { it.value.isNotBlank() }.minByOrNull { answerPriority.getValue(it.provenance) }

    private companion object {
        val answerPriority = mapOf(
            WorksheetAnswerProvenance.ANSWER_KEY to 0,
            WorksheetAnswerProvenance.VISIBLE_TEXT to 1,
            WorksheetAnswerProvenance.AI_INFERENCE to 2,
            WorksheetAnswerProvenance.TEACHER to 3,
        )
    }
}

@Component
class WorksheetReviewValidator(
    private val properties: WorksheetImportProperties,
) {
    @Suppress("CognitiveComplexMethod", "CyclomaticComplexMethod", "LongMethod")
    fun blockers(review: WorksheetReview, expectedPageIds: List<java.util.UUID> = review.pages.map { it.id }): List<WorksheetReviewBlocker> = buildList {
        val reviewedIds = review.pages.map { it.id }
        expectedPageIds.filterNot(reviewedIds::contains).forEach { missing ->
            add(blocker(WorksheetBlockerCode.UNCLASSIFIED_REGION, missing, null, null))
        }
        reviewedIds.filterNot(expectedPageIds::contains).forEach { extra ->
            add(blocker(WorksheetBlockerCode.UNCLASSIFIED_REGION, extra, null, null))
        }
        if (reviewedIds.filter(expectedPageIds::contains) != expectedPageIds.filter(reviewedIds::contains)) {
            reviewedIds.firstOrNull()?.let { add(blocker(WorksheetBlockerCode.UNCLASSIFIED_REGION, it, null, null)) }
        }
        review.pages.forEach { page -> page.groups.forEach { group ->
            when (group.type) {
                WorksheetInteractionType.FILL_GAPS -> group.gaps.forEach { gap ->
                    val answer = gap.answer
                    if (answer == null || answer.value.isBlank()) add(blocker(WorksheetBlockerCode.MISSING_ANSWER, page.id, group.id, gap.id))
                    if (answer != null && answer.confidence < properties.analysis.confidenceThreshold && !answer.confirmed) {
                        add(blocker(WorksheetBlockerCode.LOW_CONFIDENCE, page.id, group.id, gap.id))
                    }
                    if (gap.region.anchor == WorksheetRegionAnchor.GEOMETRY && answer?.provenance != WorksheetAnswerProvenance.TEACHER && answer?.confirmed != true) {
                        add(blocker(WorksheetBlockerCode.UNCLASSIFIED_REGION, page.id, group.id, gap.id))
                    }
                    if (group.gapMode == WorksheetGapMode.FORM_TRANSFORM && gap.baseForm.isNullOrBlank()) {
                        add(blocker(WorksheetBlockerCode.MISSING_ANSWER, page.id, group.id, gap.id))
                    }
                    val accepted = gap.acceptedAnswers.map(String::trim)
                    val distractors = gap.distractors.map { it.value.trim() }
                    if (accepted.any(String::isEmpty) || accepted.distinct().size != accepted.size ||
                        distractors.any(String::isEmpty) || distractors.distinct().size != distractors.size ||
                        accepted.any(distractors::contains)) {
                        add(blocker(WorksheetBlockerCode.MISSING_ANSWER, page.id, group.id, gap.id))
                    }
                    if (group.gapMode == WorksheetGapMode.SINGLE_CHOICE) {
                        val options = gap.options.map(String::trim)
                        if (options.size < 2 || options.any(String::isEmpty) || options.distinct().size != options.size || answer?.value !in options) {
                            add(blocker(WorksheetBlockerCode.MISSING_ANSWER, page.id, group.id, gap.id))
                        }
                    }
                }
                WorksheetInteractionType.MATCHING_PAIRS -> group.pairs.forEach { pair ->
                    val incomplete = listOf(pair.left, pair.right).any { endpoint ->
                        endpoint.region.width <= 0 || endpoint.region.height <= 0 ||
                            (endpoint.kind == WorksheetContentKind.TEXT && endpoint.text.isNullOrBlank())
                    }
                    if (incomplete) add(blocker(WorksheetBlockerCode.INCOMPLETE_PAIR, page.id, group.id, pair.id))
                }
                WorksheetInteractionType.MULTIPLE_CHOICE -> group.questions.forEach { question ->
                    val ids = question.options.map { it.id }
                    val invalid = question.prompt.isBlank() || question.options.size < 2 || ids.distinct().size != ids.size ||
                        question.correctOptionIds.isEmpty() || !ids.containsAll(question.correctOptionIds) || question.options.any { it.text.isBlank() }
                    if (invalid) add(blocker(WorksheetBlockerCode.INCOMPLETE_MULTIPLE_CHOICE, page.id, group.id, question.id))
                    question.options.filter { it.id in question.correctOptionIds }.forEach { option ->
                        if (option.confidence < properties.analysis.confidenceThreshold && !option.confirmed) {
                            add(blocker(WorksheetBlockerCode.LOW_CONFIDENCE, page.id, group.id, question.id))
                        }
                    }
                }
                WorksheetInteractionType.FLASHCARDS -> group.cards.forEach { card ->
                    val sides = listOf(card.front, card.back)
                    val incomplete = sides.any { side ->
                        (side.kind == WorksheetContentKind.TEXT && side.text.isNullOrBlank()) ||
                            (side.kind == WorksheetContentKind.IMAGE && side.region == null)
                    }
                    if (incomplete) add(blocker(WorksheetBlockerCode.INCOMPLETE_FLASHCARD, page.id, group.id, card.id))
                    if (sides.any { it.confidence < properties.analysis.confidenceThreshold && !it.confirmed }) {
                        add(blocker(WorksheetBlockerCode.LOW_CONFIDENCE, page.id, group.id, card.id))
                    }
                }
            }
            if (group.gapMode == WorksheetGapMode.WORD_BANK) {
                val normalized = group.wordBank.map(String::trim)
                if (normalized.any(String::isEmpty) || normalized.distinct().size != normalized.size ||
                    group.gaps.mapNotNull { it.answer?.value }.any { it !in normalized }) {
                    add(blocker(WorksheetBlockerCode.INVALID_WORD_BANK, page.id, group.id, null))
                }
            }
        } }
    }.distinct()

    private fun blocker(code: WorksheetBlockerCode, pageId: java.util.UUID, groupId: String?, itemId: String?) =
        WorksheetReviewBlocker(code, pageId, groupId, itemId)
}
