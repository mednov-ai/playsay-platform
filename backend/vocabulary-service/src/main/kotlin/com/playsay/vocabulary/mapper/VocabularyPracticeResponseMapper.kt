package com.playsay.vocabulary.mapper

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.VocabularyHomeworkPreparationResponse
import com.playsay.vocabulary.dto.VocabularyHomeworkSessionRef
import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.VocabularyLearningEntryResponse
import com.playsay.vocabulary.dto.VocabularyPracticeItemResponse
import com.playsay.vocabulary.dto.VocabularyPracticeResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSessionSummaryResponse
import com.playsay.vocabulary.dto.VocabularySkillStateResponse
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.entity.VocabularyUserProjection
import java.time.Instant
import org.springframework.stereotype.Component

@Component
class VocabularyPracticeResponseMapper(
    private val objectMapper: ObjectMapper,
) {
    fun practice(
        entity: VocabularyPracticeEntity,
        sessions: List<VocabularyPracticeSessionSummaryResponse>,
    ) = VocabularyPracticeResponse(
        id = entity.id,
        delivery = entity.delivery,
        mode = entity.mode,
        status = entity.status,
        lessonId = entity.lessonId,
        assignmentId = entity.assignmentId,
        sessions = sessions,
        createdAt = entity.createdAt,
        updatedAt = entity.updatedAt,
    )

    fun homework(
        entity: VocabularyPracticeEntity,
        sessions: List<VocabularyPracticeSessionEntity>,
    ) = VocabularyHomeworkPreparationResponse(
        practiceId = entity.id,
        sessions = sessions.map { session -> VocabularyHomeworkSessionRef(session.id, session.ownerSubject) },
    )

    fun session(
        entity: VocabularyPracticeSessionEntity,
        sessionItems: List<VocabularyPracticeItemEntity>,
        ownerName: String?,
        practice: VocabularyPracticeEntity?,
        currentItem: VocabularyPracticeItemEntity?,
    ): VocabularyPracticeSessionSummaryResponse = VocabularyPracticeSessionSummaryResponse(
        id = entity.id,
        ownerSubject = entity.ownerSubject,
        ownerName = ownerName,
        status = entity.status,
        revision = entity.revision,
        completedItems = sessionItems.count { it.completedAt != null },
        totalItems = sessionItems.size,
        correctCount = entity.correctCount,
        attemptCount = entity.attemptCount,
        accuracy = entity.attemptCount.takeIf { it > 0 }?.let { entity.correctCount.toDouble() / it },
        currentItem = currentItem?.let(::item),
        teacherHint = entity.teacherHint,
        helpRequested = entity.helpRequested,
        startedAt = entity.startedAt,
        completedAt = entity.completedAt,
        updatedAt = entity.updatedAt,
        practiceId = entity.practiceId,
        delivery = practice?.delivery,
        mode = practice?.mode,
        lessonId = practice?.lessonId,
        assignmentId = practice?.assignmentId,
        lastAcknowledgedPosition = entity.currentItemPosition,
    )

    fun learningEntry(
        entry: VocabularyEntryEntity,
        states: List<VocabularySkillStateEntity>,
        stage: LearningStage,
        dueAt: Instant,
        now: Instant,
    ) = VocabularyLearningEntryResponse(
        entry = entry.toResponse(),
        stage = stage,
        dueAt = dueAt,
        overdue = !entry.practicePaused && !entry.translation.isNullOrBlank() && !dueAt.isAfter(now),
        skills = states.sortedBy { it.skill.ordinal }.map(::skillState),
    )

    fun skillState(entity: VocabularySkillStateEntity) = VocabularySkillStateResponse(
        skill = entity.skill,
        stage = entity.stage,
        intervalIndex = entity.intervalIndex,
        dueAt = entity.dueAt,
        successStreak = entity.successStreak,
        lapseCount = entity.lapseCount,
        lastRating = entity.lastRating,
        lastPracticedAt = entity.lastPracticedAt,
        policyVersion = entity.policyVersion,
        reviewReason = runCatching { com.playsay.vocabulary.dto.MemoryReviewReason.valueOf(entity.reviewReason) }
            .getOrDefault(com.playsay.vocabulary.dto.MemoryReviewReason.NEW),
        difficultyScore = entity.difficultyScore.toDouble(),
        available = entity.skillAvailable,
    )

    fun item(entity: VocabularyPracticeItemEntity): VocabularyPracticeItemResponse {
        val snapshot = snapshot(entity)
        val options = runCatching {
            objectMapper.readValue(entity.optionsJson, object : TypeReference<List<String>>() {})
        }.getOrDefault(emptyList())
        val content = if (entity.schemaVersion >= 2) {
            runCatching {
                objectMapper.readValue(entity.contentJson, object : TypeReference<Map<String, Any?>>() {})
            }.getOrDefault(emptyMap())
        } else {
            emptyMap()
        }
        return VocabularyPracticeItemResponse(
            id = entity.id,
            position = entity.position,
            entryId = entity.entryId,
            skill = entity.skill,
            exerciseType = entity.exerciseType,
            prompt = entity.prompt,
            options = options,
            sourceText = snapshot["sourceText"].takeIf { entity.schemaVersion < 2 },
            translation = snapshot["translation"].takeIf { entity.schemaVersion < 2 },
            example = snapshot["example"].takeIf { entity.schemaVersion < 2 },
            schemaVersion = entity.schemaVersion,
            content = content,
            affectsSchedule = entity.affectsSchedule,
        )
    }

    fun snapshot(entity: VocabularyPracticeItemEntity): Map<String, String?> =
        runCatching {
            objectMapper.readValue(entity.snapshotJson, object : TypeReference<Map<String, String?>>() {})
        }.getOrDefault(emptyMap())

    fun displayLabel(user: VocabularyUserProjection): String =
        user.displayName?.trim()?.takeIf(String::isNotEmpty)
            ?: user.username?.trim()?.takeIf(String::isNotEmpty)
            ?: user.keycloakSubject

    fun forActor(
        actorSubject: String,
        practice: VocabularyPracticeEntity,
        response: VocabularyPracticeResponse,
    ): VocabularyPracticeResponse {
        if (practice.createdBySubject == actorSubject) return response
        val ownSession = response.sessions.firstOrNull { it.ownerSubject == actorSubject } ?: return response
        return response.copy(sessions = listOf(ownSession))
    }
}
