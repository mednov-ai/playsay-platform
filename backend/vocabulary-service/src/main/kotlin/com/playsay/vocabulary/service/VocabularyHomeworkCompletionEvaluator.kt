package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyCompletionThresholdsRequest
import com.playsay.vocabulary.dto.VocabularyHomeworkCompletionPolicy
import com.playsay.vocabulary.entity.VocabularyPracticeAttemptEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularyKeyResultEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import java.util.UUID
import org.springframework.stereotype.Component

data class VocabularyHomeworkProgressEvaluation(
    val state: String,
    val completionRatio: Double?,
    val accuracy: Double?,
    val difficultWordCount: Int,
    val distinctGradedPrompts: Int,
    val distinctEntries: Int,
    val hintsUsed: Int,
    val activeDurationMs: Long,
    val masteryRatio: Double?,
    val completionPolicy: VocabularyHomeworkCompletionPolicy,
    val completionPolicyVersion: String,
)

@Component
class VocabularyHomeworkCompletionEvaluator(private val objectMapper: ObjectMapper) {
    fun evaluate(
        practice: VocabularyPracticeEntity,
        session: VocabularyPracticeSessionEntity,
        items: List<VocabularyPracticeItemEntity>,
        attempts: List<VocabularyPracticeAttemptEntity>,
        skillStates: List<VocabularySkillStateEntity>,
        keyResults: List<VocabularyKeyResultEntity> = emptyList(),
    ): VocabularyHomeworkProgressEvaluation {
        val thresholds = runCatching {
            objectMapper.readValue(practice.completionThresholdsJson, VocabularyCompletionThresholdsRequest::class.java)
        }.getOrDefault(VocabularyCompletionThresholdsRequest(policyVersion = practice.completionPolicyVersion))
        val itemsById = items.associateBy(VocabularyPracticeItemEntity::id)
        val gradedAttempts = attempts.filter { attempt -> itemsById[attempt.itemId]?.exerciseType != PracticeExerciseType.FLASHCARD }
        val distinctPromptIds = gradedAttempts.map(VocabularyPracticeAttemptEntity::itemId).toSet()
        val keyPromptIds = keyResults.map(VocabularyKeyResultEntity::targetId).toSet()
        val distinctEntryIds = (
            distinctPromptIds.mapNotNull { itemId -> itemsById[itemId]?.entryId } +
                keyResults.flatMap { result -> runCatching { objectMapper.readValue(result.sourceEntryIdsJson, Array<UUID>::class.java).toList() }.getOrDefault(emptyList()) }
            ).toSet()
        val distinctPromptCount = distinctPromptIds.size + keyPromptIds.size
        val gradedItems = items.filter { it.exerciseType != PracticeExerciseType.FLASHCARD }
            .ifEmpty { items }
        val potentialEntryCount = gradedItems.mapNotNull(VocabularyPracticeItemEntity::entryId).toSet().size
        val shortSnapshot = gradedItems.size < thresholds.distinctGradedPrompts || potentialEntryCount < thresholds.distinctEntries
        val allSnapshotPromptsCompleted = gradedItems.isNotEmpty() && gradedItems.all { it.completedAt != null }
        val meaningfulActivity = if (shortSnapshot) {
            allSnapshotPromptsCompleted
        } else {
            distinctPromptCount >= thresholds.distinctGradedPrompts && distinctEntryIds.size >= thresholds.distinctEntries
        }
        val relevantEntryIds = items.mapNotNull(VocabularyPracticeItemEntity::entryId).toSet()
        val availableStates = skillStates.filter { it.entryId in relevantEntryIds && it.skillAvailable }
        val masteryRatio = availableStates.takeIf { it.isNotEmpty() }
            ?.let { states -> states.count { it.stage == LearningStage.MASTERED }.toDouble() / states.size }
        val policyCompleted = when (practice.completionPolicy) {
            VocabularyHomeworkCompletionPolicy.MEANINGFUL_ACTIVITY -> meaningfulActivity
            VocabularyHomeworkCompletionPolicy.COMPLETE_SESSION -> session.status == SessionStatus.COMPLETED
            VocabularyHomeworkCompletionPolicy.MASTERY_TARGET -> masteryRatio != null && masteryRatio * 100 >= thresholds.masteryPercent
            VocabularyHomeworkCompletionPolicy.TEACHER_REVIEW -> false
        }
        val state = when {
            session.status == SessionStatus.CANCELLED -> "FAILED"
            practice.completionPolicy == VocabularyHomeworkCompletionPolicy.TEACHER_REVIEW && session.status == SessionStatus.COMPLETED -> "AWAITING_REVIEW"
            policyCompleted -> "COMPLETED"
            session.status == SessionStatus.NOT_STARTED -> "NOT_STARTED"
            else -> "IN_PROGRESS"
        }
        return VocabularyHomeworkProgressEvaluation(
            state = state,
            completionRatio = items.takeIf { it.isNotEmpty() }?.let { rows -> rows.count { it.completedAt != null }.toDouble() / rows.size },
            accuracy = (attempts.size + keyResults.size).takeIf { it > 0 }?.let { total ->
                (attempts.count(VocabularyPracticeAttemptEntity::correct) + keyResults.count { it.errors == 0 }).toDouble() / total
            },
            difficultWordCount = maxOf(items.count { it.attemptCount > 1 }, keyResults.count { it.errors > 0 }),
            distinctGradedPrompts = distinctPromptCount,
            distinctEntries = distinctEntryIds.size,
            hintsUsed = attempts.sumOf(VocabularyPracticeAttemptEntity::hintsUsed),
            activeDurationMs = attempts.sumOf(VocabularyPracticeAttemptEntity::durationMs) + keyResults.sumOf(VocabularyKeyResultEntity::durationMs),
            masteryRatio = masteryRatio,
            completionPolicy = practice.completionPolicy,
            completionPolicyVersion = practice.completionPolicyVersion,
        )
    }
}
