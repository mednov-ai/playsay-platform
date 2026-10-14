package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.MemoryReviewReason
import com.playsay.vocabulary.dto.VocabularySelectionCriteriaRequest
import com.playsay.vocabulary.dto.VocabularySelectionMatch
import com.playsay.vocabulary.dto.VocabularySelectionSource
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import java.math.BigDecimal
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class VocabularySelectionResolverTest {
    private val now = Instant.parse("2026-08-20T12:00:00Z")
    private val resolver = VocabularySelectionResolver()

    @Test
    fun `union combines recent and difficult while intersection requires both`() {
        val recent = entry("recent", now.minus(2, ChronoUnit.DAYS))
        val difficult = entry("difficult", now.minus(60, ChronoUnit.DAYS))
        val states = mapOf(
            recent.id to listOf(state(recent)),
            difficult.id to listOf(state(difficult).apply {
                reviewReason = MemoryReviewReason.DIFFICULT.name
                difficultyScore = BigDecimal("0.7000")
            }),
        )
        val criteria = VocabularySelectionCriteriaRequest(
            sources = setOf(VocabularySelectionSource.RECENT, VocabularySelectionSource.DIFFICULT),
            recentDays = 14,
        )

        val union = resolver.resolve(listOf(recent, difficult), states, criteria, now)
        val intersection = resolver.resolve(
            listOf(recent, difficult),
            states,
            criteria.copy(match = VocabularySelectionMatch.ALL),
            now,
        )

        assertEquals(setOf(recent.id, difficult.id), union.eligibleEntries.map { it.id }.toSet())
        assertTrue(intersection.eligibleEntries.isEmpty())
        assertEquals(mapOf("RECENT" to 1, "DIFFICULT" to 1), union.categoryCounts)
    }

    @Test
    fun `foreign explicit ids are opaque exclusions`() {
        val owned = entry("owned", now)
        val foreignId = UUID.randomUUID()
        val result = resolver.resolve(
            listOf(owned),
            mapOf(owned.id to listOf(state(owned))),
            VocabularySelectionCriteriaRequest(
                sources = setOf(VocabularySelectionSource.EXPLICIT),
                explicitEntryIds = listOf(owned.id, foreignId),
            ),
            now,
        )

        assertEquals(listOf(owned.id), result.eligibleEntries.map { it.id })
        assertEquals("NOT_FOUND_OR_UNAUTHORIZED", result.exclusions[foreignId])
    }

    private fun entry(word: String, updatedAt: Instant) = VocabularyEntryEntity(
        id = UUID.nameUUIDFromBytes(word.toByteArray()),
        ownerSubject = "learner",
        sourceText = word,
        normalizedSource = word,
        translation = "meaning",
        createdBySubject = "learner",
        createdAt = updatedAt,
        updatedAt = updatedAt,
    )

    private fun state(entry: VocabularyEntryEntity) = VocabularySkillStateEntity(
        entryId = entry.id,
        ownerSubject = entry.ownerSubject,
        skill = VocabularySkill.MEANING,
        dueAt = now.plus(1, ChronoUnit.DAYS),
    )
}
