package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.dto.VocabularySourceType
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyOccurrenceEntity
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class VocabularyOverviewTest {
    private val lessonId = UUID.randomUUID()

    @Test
    fun `lesson words lead and recent words fill the five item overview without duplicates`() {
        val lessonNewest = entry("arrive", "прибывать", "2026-07-28T09:05:00Z", lessonId)
        val lessonOlder = entry("journey", "путешествие", "2026-07-28T09:03:00Z", lessonId)
        val recentNewest = entry("ticket", "билет", "2026-07-28T09:04:00Z")
        val recentOlder = entry("platform", "платформа", "2026-07-28T09:02:00Z")
        val oldest = entry("luggage", "багаж", "2026-07-28T09:01:00Z")
        val excluded = entry("delay", "задержка", "2026-07-28T09:00:00Z")

        val overview = selectVocabularyOverview(
            listOf(recentOlder, excluded, lessonOlder, recentNewest, lessonNewest, oldest),
            lessonId,
            5,
        )

        assertEquals(listOf("arrive", "journey"), overview.lessonEntries.map { it.sourceText })
        assertEquals(listOf("ticket", "platform", "luggage"), overview.recentEntries.map { it.sourceText })
    }

    @Test
    fun `overview without lesson words returns the five most recently updated entries`() {
        val entries = (1..6).map { index ->
            entry("word-$index", "translation-$index", "2026-07-28T09:0${index}:00Z")
        }

        val overview = selectVocabularyOverview(entries, lessonId, 5)

        assertEquals(emptyList<String>(), overview.lessonEntries.map { it.sourceText })
        assertEquals(listOf("word-6", "word-5", "word-4", "word-3", "word-2"), overview.recentEntries.map { it.sourceText })
    }

    private fun entry(
        source: String,
        translation: String,
        updatedAt: String,
        occurrenceLessonId: UUID? = null,
    ): VocabularyEntryEntity {
        val updated = Instant.parse(updatedAt)
        return VocabularyEntryEntity(
            ownerSubject = "student-subject",
            sourceText = source,
            normalizedSource = source,
            sourceLanguage = "en",
            targetLanguage = "ru",
            translation = translation,
            status = EntryStatus.ACTIVE,
            createdBySubject = "student-subject",
            createdAt = updated,
            updatedAt = updated,
        ).also { entry ->
            if (occurrenceLessonId != null) {
                entry.occurrences += VocabularyOccurrenceEntity(
                    entry = entry,
                    sourceType = VocabularySourceType.LESSON,
                    lessonId = occurrenceLessonId,
                    addedBySubject = "teacher-subject",
                    createdAt = updated,
                )
            }
        }
    }
}
