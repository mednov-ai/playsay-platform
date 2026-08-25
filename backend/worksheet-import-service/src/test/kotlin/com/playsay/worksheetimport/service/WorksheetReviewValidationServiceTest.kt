package com.playsay.worksheetimport.service

import com.playsay.worksheetimport.ai.StubWorksheetAnalysisProvider
import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.ReviewedValue
import com.playsay.worksheetimport.domain.WorksheetAnswerProvenance
import com.playsay.worksheetimport.domain.WorksheetBlockerCode
import com.playsay.worksheetimport.domain.WorksheetReview
import com.playsay.worksheetimport.domain.WorksheetReviewPage
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.jupiter.api.Test

class WorksheetReviewValidationServiceTest {
    private val validator = WorksheetReviewValidator(WorksheetImportProperties())

    @Test
    fun `answer selection follows provenance priority while explicit teacher override wins`() {
        val canonicalizer = WorksheetReviewCanonicalizer()
        val ai = value("AI", WorksheetAnswerProvenance.AI_INFERENCE)
        val visible = value("visible", WorksheetAnswerProvenance.VISIBLE_TEXT)
        val key = value("key", WorksheetAnswerProvenance.ANSWER_KEY)
        val teacher = value("teacher", WorksheetAnswerProvenance.TEACHER)

        assertEquals("key", canonicalizer.chooseAnswer(listOf(ai, visible, key))?.value)
        assertEquals("teacher", canonicalizer.chooseAnswer(listOf(key, visible, ai), teacher)?.value)
    }

    @Test
    fun `confirmation of the proposed answer survives review merge`() {
        val page = StubWorksheetAnalysisProvider().fixture(UUID.randomUUID(), "FORM_ENDING")
        val proposal = WorksheetReview(
            listOf(WorksheetReviewPage(page.pageId, 0, page.role, sections = page.sections, groups = page.groups)),
        )
        val submitted = proposal.copy(
            pages = proposal.pages.map { reviewPage ->
                reviewPage.copy(groups = reviewPage.groups.map { group ->
                    group.copy(gaps = group.gaps.map { gap -> gap.copy(answer = gap.answer?.copy(confirmed = true)) })
                })
            },
        )

        val merged = WorksheetReviewCanonicalizer().merge(proposal, submitted)

        assertTrue(merged.pages.single().groups.single().gaps.single().answer?.confirmed == true)
    }

    @Test
    fun `blocks incomplete low confidence and invalid editable exercise structures`() {
        val stub = StubWorksheetAnalysisProvider()
        val gapPage = stub.fixture(UUID.randomUUID(), "EXPLICIT_BLANK")
        val wordBankPage = stub.fixture(UUID.randomUUID(), "WORD_BANK").let { page ->
            page.copy(groups = page.groups.map { it.copy(wordBank = listOf("are", "are", "")) })
        }
        val choicePage = stub.fixture(UUID.randomUUID(), "MULTIPLE_CHOICE").let { page ->
            page.copy(groups = page.groups.map { group ->
                group.copy(questions = group.questions.map { question ->
                    question.copy(options = question.options.map { option ->
                        if (option.id in question.correctOptionIds) option.copy(confidence = 0.2, confirmed = false) else option
                    })
                })
            })
        }
        val review = WorksheetReview(listOf(gapPage, wordBankPage, choicePage).mapIndexed { index, page ->
            WorksheetReviewPage(page.pageId, index, page.role, sections = page.sections, groups = page.groups)
        })

        val codes = validator.blockers(review).map { it.code }.toSet()
        assertTrue(WorksheetBlockerCode.MISSING_ANSWER in codes)
        assertTrue(WorksheetBlockerCode.INVALID_WORD_BANK in codes)
        assertTrue(WorksheetBlockerCode.LOW_CONFIDENCE in codes)
    }

    @Test
    fun `missing reordered or extra pages prevent readiness`() {
        val first = UUID.randomUUID()
        val second = UUID.randomUUID()
        val review = WorksheetReview(listOf(WorksheetReviewPage(second, 0, com.playsay.worksheetimport.domain.WorksheetPageRole.STATIC_REFERENCE)))
        assertTrue(validator.blockers(review, listOf(first, second)).any { it.code == WorksheetBlockerCode.UNCLASSIFIED_REGION })
    }

    private fun value(value: String, provenance: WorksheetAnswerProvenance) = ReviewedValue(value, provenance, 1.0, true)
}
