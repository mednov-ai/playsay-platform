package com.playsay.vocabulary.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.VocabularyAttemptRequest
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import java.text.Normalizer
import java.util.Locale
import org.springframework.stereotype.Service

@Service
class VocabularySessionGradingService(
    private val objectMapper: ObjectMapper,
) {
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
        val normalizedAnswer = normalize(request.answer)
        val answerCorrect = !objective || acceptedAnswers.ifEmpty { listOf(item.answer) }
            .any { normalizedAnswer == normalize(it) }
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

    private fun normalize(value: String?): String = Normalizer.normalize(value.orEmpty(), Normalizer.Form.NFKC)
        .lowercase(Locale.ROOT)
        .replace('’', '\'')
        .replace(Regex("[\\s\\p{P}\\p{Z}]+"), " ")
        .trim()
}

data class VocabularyGradingDecision(
    val answerCorrect: Boolean,
    val correct: Boolean,
    val rating: PracticeRating,
)

private val selfRatedExercises = setOf(PracticeExerciseType.FLASHCARD)
