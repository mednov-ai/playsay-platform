package com.playsay.vocabulary.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.VocabularyAttemptRequest
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import java.text.Normalizer
import java.util.Locale
import org.springframework.stereotype.Service

@Service
class VocabularySessionGradingService(
    private val objectMapper: ObjectMapper,
    policies: List<VocabularyAnswerEvaluationPolicy> = listOf(
        LegacyVocabularyAnswerEvaluationPolicy(),
        DeterministicVocabularyAnswerEvaluationPolicy(),
    ),
) {
    private val policiesByVersion = policies.associateBy(VocabularyAnswerEvaluationPolicy::version)

    fun grade(
        item: VocabularyPracticeItemEntity,
        request: VocabularyAttemptRequest,
    ): VocabularyGradingDecision {
        val objective = item.exerciseType !in selfRatedExercises
        val acceptedAnswers = if (item.schemaVersion >= 2) {
            runCatching {
                objectMapper.readValue(item.acceptedAnswersJson, object : TypeReference<List<String>>() {})
            }.getOrDefault(emptyList())
        } else {
            emptyList()
        }
        val evaluator = policiesByVersion[if (item.schemaVersion >= 2) "deterministic-v2" else "legacy-v1"]
            ?: error("Vocabulary answer evaluator is not configured")
        val answerCorrect = !objective || evaluator.matches(
            item.skill,
            request.answer,
            acceptedAnswers.ifEmpty { listOf(item.answer) },
        )
        val rating = when {
            objective && !answerCorrect -> PracticeRating.AGAIN
            request.hintsUsed > 0 -> PracticeRating.HARD
            request.rating != null -> request.rating
            else -> PracticeRating.GOOD
        }
        return VocabularyGradingDecision(
            answerCorrect = answerCorrect,
            correct = rating != PracticeRating.AGAIN,
            rating = rating,
        )
    }
}

interface VocabularyAnswerEvaluationPolicy {
    val version: String
    fun matches(skill: VocabularySkill, answer: String?, acceptedAnswers: List<String>): Boolean
}

@Service
class LegacyVocabularyAnswerEvaluationPolicy : VocabularyAnswerEvaluationPolicy {
    override val version = "legacy-v1"
    override fun matches(skill: VocabularySkill, answer: String?, acceptedAnswers: List<String>): Boolean {
        val normalized = tolerantNormalize(answer)
        return acceptedAnswers.any { tolerantNormalize(it) == normalized }
    }
}

@Service
class DeterministicVocabularyAnswerEvaluationPolicy : VocabularyAnswerEvaluationPolicy {
    override val version = "deterministic-v2"

    override fun matches(skill: VocabularySkill, answer: String?, acceptedAnswers: List<String>): Boolean {
        val normalize = when (skill) {
            VocabularySkill.FORM, VocabularySkill.SPELLING -> ::strictFormNormalize
            VocabularySkill.MEANING, VocabularySkill.CONTEXT -> ::tolerantNormalize
        }
        val normalized = normalize(answer)
        return normalized.isNotEmpty() && acceptedAnswers.any { normalize(it) == normalized }
    }
}

private fun normalizedBase(value: String?): String = Normalizer.normalize(value.orEmpty(), Normalizer.Form.NFKC)
    .lowercase(Locale.ROOT)
    .replace('’', '\'')
    .replace('‘', '\'')
    .replace(Regex("[\\s\\p{Z}]+"), " ")
    .trim()

private fun strictFormNormalize(value: String?): String = normalizedBase(value)

private fun tolerantNormalize(value: String?): String = normalizedBase(value)
    .replace(Regex("[\\p{P}]+"), " ")
    .replace(Regex("\\s+"), " ")
    .trim()

data class VocabularyGradingDecision(
    val answerCorrect: Boolean,
    val correct: Boolean,
    val rating: PracticeRating,
)

private val selfRatedExercises = setOf(PracticeExerciseType.FLASHCARD)
