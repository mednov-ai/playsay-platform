package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeMode
import com.playsay.vocabulary.dto.PracticeSelectionReason
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class VocabularyPracticePlannerTest {
    private val now = Instant.parse("2026-07-29T12:00:00Z")
    private val planner = VocabularyPracticePlanner()

    @Test
    fun `writing always includes a productive task`() {
        val entries = listOf(entry("take care", "беречь"))
        val plan = planner.planOwner(
            "learner",
            entries,
            states(entries),
            VocabularyPracticeSettingsRequest(mode = PracticeMode.WRITING),
            UUID.nameUUIDFromBytes("writing".toByteArray()),
            now,
        )

        assertTrue(plan.items.any { it.type in setOf(PracticeExerciseType.FORM_INPUT, PracticeExerciseType.PHRASE_BUILDER) })
        val phraseTokens = plan.items.first { it.type == PracticeExerciseType.PHRASE_BUILDER }.content["tokens"] as List<*>
        assertFalse(phraseTokens
            .map { (it as Map<*, *>)["id"].toString() }
            .all { id -> id.matches(Regex("p\\d+")) })
    }

    @Test
    fun `meaning choice falls back to input when four quality options are unavailable`() {
        val learning = entry("hello", "привет")
        val state = VocabularySkillStateEntity(
            entryId = learning.id,
            ownerSubject = "learner",
            skill = VocabularySkill.MEANING,
            intervalIndex = 0,
            successStreak = 1,
            lastPracticedAt = now.minusSeconds(60),
            dueAt = now,
        )
        val plan = planner.planOwner(
            "learner",
            listOf(learning, entry("bye", "пока")),
            mapOf(learning.id to listOf(state)),
            VocabularyPracticeSettingsRequest(mode = PracticeMode.BALANCED),
            UUID.nameUUIDFromBytes("fallback".toByteArray()),
            now,
        )

        assertFalse(plan.items.any { it.type == PracticeExerciseType.MEANING_CHOICE })
        assertTrue(plan.items.any { it.entryId == learning.id && it.type == PracticeExerciseType.FORM_INPUT })
    }

    @Test
    fun `new words get accessible group matching and round interleaving`() {
        val entries = listOf(
            entry("one", "один"),
            entry("two", "два"),
            entry("three", "три"),
            entry("four", "четыре"),
        )
        val plan = planner.planOwner(
            "learner",
            entries,
            states(entries),
            VocabularyPracticeSettingsRequest(mode = PracticeMode.BALANCED, wordLimit = 4),
            UUID.nameUUIDFromBytes("matching".toByteArray()),
            now,
        )

        val matching = plan.items.first()
        assertEquals(PracticeExerciseType.MATCHING, matching.type)
        assertFalse(matching.affectsSchedule)
        assertTrue(plan.items.filter { it.type == PracticeExerciseType.FLASHCARD }.all { it.affectsSchedule })
        val left = matching.content["left"] as List<*>
        val right = matching.content["right"] as List<*>
        assertTrue(left.size >= 2)
        val leftIds = left.map { (it as Map<*, *>)["id"].toString() }.toSet()
        val rightIds = right.map { (it as Map<*, *>)["id"].toString() }.toSet()
        assertTrue(leftIds.intersect(rightIds).isEmpty())
        assertFalse(leftIds.all { id -> id.matches(Regex("l\\d+")) })
        assertFalse(rightIds.all { id -> id.matches(Regex("r\\d+")) })
        val submittedOrder = matching.answer.split("|").map { pair -> pair.substringBefore(":") }
        assertEquals(submittedOrder.sorted(), submittedOrder)
        val perWordAfterMatching = plan.items.drop(1).take(entries.size.coerceAtMost(3))
        assertEquals(perWordAfterMatching.mapNotNull { it.entryId }.distinct().size, perWordAfterMatching.size)
        assertTrue(plan.selected.all { it.reason == PracticeSelectionReason.OVERDUE || it.reason == PracticeSelectionReason.DUE_TODAY })
    }

    @Test
    fun `recent lesson words are selected before unrelated future review`() {
        val recent = entry("recent", "недавний")
        val unrelated = entry("later", "позже")
        val futureStates = listOf(recent, unrelated).associate { candidate ->
            candidate.id to VocabularySkill.entries.map { skill ->
                VocabularySkillStateEntity(
                    entryId = candidate.id,
                    ownerSubject = candidate.ownerSubject,
                    skill = skill,
                    intervalIndex = 2,
                    successStreak = 3,
                    lastPracticedAt = now.minusSeconds(60),
                    dueAt = now.plusSeconds(172_800),
                )
            }
        }

        val plan = planner.planOwner(
            "learner",
            listOf(unrelated, recent),
            futureStates,
            VocabularyPracticeSettingsRequest(mode = PracticeMode.QUICK, wordLimit = 1),
            UUID.nameUUIDFromBytes("recent".toByteArray()),
            now,
            setOf(recent.id),
        )

        assertEquals(recent.id, plan.selected.single().entryId)
        assertEquals(PracticeSelectionReason.RECENT_LESSON, plan.selected.single().reason)
    }

    private fun entry(source: String, translation: String) = VocabularyEntryEntity(
        id = UUID.nameUUIDFromBytes(source.toByteArray()),
        ownerSubject = "learner",
        sourceText = source,
        normalizedSource = source,
        translation = translation,
        createdBySubject = "teacher",
        createdAt = now.minusSeconds(3600),
        updatedAt = now,
    )

    private fun states(entries: List<VocabularyEntryEntity>) = entries.associate { entry ->
        entry.id to VocabularySkill.entries.map { skill ->
            VocabularySkillStateEntity(
                entryId = entry.id,
                ownerSubject = entry.ownerSubject,
                skill = skill,
                dueAt = entry.createdAt,
                createdAt = entry.createdAt,
                updatedAt = entry.updatedAt,
            )
        }
    }
}
