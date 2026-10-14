package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.MemoryReviewReason
import com.playsay.vocabulary.dto.PracticeSelectionReason
import com.playsay.vocabulary.dto.VocabularySelectionCriteriaRequest
import com.playsay.vocabulary.dto.VocabularySelectionMatch
import com.playsay.vocabulary.dto.VocabularySelectionSource
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import org.springframework.stereotype.Component
import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyOccurrenceRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
import java.math.BigDecimal

data class VocabularySelectionResolution(
    val eligibleEntries: List<VocabularyEntryEntity>,
    val reasons: Map<UUID, PracticeSelectionReason>,
    val exclusions: Map<UUID, String>,
    val categoryCounts: Map<String, Int>,
)

@Component
class VocabularySelectionResolver(
    private val indexedLookup: VocabularyIndexedSelectionLookup? = null,
) {
    fun resolve(
        ownerEntries: List<VocabularyEntryEntity>,
        statesByEntry: Map<UUID, List<VocabularySkillStateEntity>>,
        criteria: VocabularySelectionCriteriaRequest?,
        now: Instant,
    ): VocabularySelectionResolution {
        if (criteria == null || criteria.sources.isEmpty()) {
            return VocabularySelectionResolution(ownerEntries, emptyMap(), emptyMap(), emptyMap())
        }
        val entriesById = ownerEntries.associateBy(VocabularyEntryEntity::id)
        val indexedIds = ownerEntries.firstOrNull()?.ownerSubject?.let { owner -> indexedLookup?.candidateIds(owner, criteria, now) }
        val candidates = indexedIds?.let { ids -> ownerEntries.filter { it.id in ids } } ?: ownerEntries
        val matchesByEntry = candidates.associate { entry ->
            entry.id to criteria.sources.filterTo(linkedSetOf()) { source ->
                matches(source, entry, statesByEntry[entry.id].orEmpty(), criteria, now)
            }
        }
        val eligible = candidates.filter { entry ->
            val matches = matchesByEntry.getValue(entry.id)
            when (criteria.match) {
                VocabularySelectionMatch.ANY -> matches.isNotEmpty()
                VocabularySelectionMatch.ALL -> matches.containsAll(criteria.sources)
            }
        }
        val explicitMissing = criteria.explicitEntryIds.filterNot(entriesById::containsKey)
            .associateWith { "NOT_FOUND_OR_UNAUTHORIZED" }
        return VocabularySelectionResolution(
            eligibleEntries = eligible,
            reasons = eligible.associate { entry -> entry.id to primaryReason(matchesByEntry.getValue(entry.id)) },
            exclusions = explicitMissing,
            categoryCounts = criteria.sources.associate { source ->
                source.name to matchesByEntry.values.count { source in it }
            },
        )
    }

    private fun matches(
        source: VocabularySelectionSource,
        entry: VocabularyEntryEntity,
        states: List<VocabularySkillStateEntity>,
        criteria: VocabularySelectionCriteriaRequest,
        now: Instant,
    ): Boolean = when (source) {
        VocabularySelectionSource.RECENT -> entry.updatedAt >= now.minus(criteria.recentDays.toLong(), ChronoUnit.DAYS) ||
            entry.occurrences.any { it.createdAt >= now.minus(criteria.recentDays.toLong(), ChronoUnit.DAYS) }
        VocabularySelectionSource.DUE -> states.filter(VocabularySkillStateEntity::skillAvailable).any { !it.dueAt.isAfter(now) }
        VocabularySelectionSource.FORGOTTEN -> states.any {
            it.reviewReason == MemoryReviewReason.LAPSED.name || it.lastRating == com.playsay.vocabulary.dto.PracticeRating.AGAIN
        }
        VocabularySelectionSource.DIFFICULT -> states.any {
            it.reviewReason == MemoryReviewReason.DIFFICULT.name || it.difficultyScore.toDouble() >= 0.55
        }
        VocabularySelectionSource.NEW -> aggregateVocabularyStage(states) == LearningStage.NEW
        VocabularySelectionSource.FAVORITE -> entry.favorite
        VocabularySelectionSource.LESSON -> criteria.lessonId != null && entry.occurrences.any { it.lessonId == criteria.lessonId }
        VocabularySelectionSource.COURSE -> criteria.courseId != null && entry.occurrences.any { it.courseId == criteria.courseId }
        VocabularySelectionSource.FULL_DICTIONARY -> true
        VocabularySelectionSource.EXPLICIT -> entry.id in criteria.explicitEntryIds
    }

    private fun primaryReason(matches: Set<VocabularySelectionSource>): PracticeSelectionReason = when {
        VocabularySelectionSource.EXPLICIT in matches -> PracticeSelectionReason.EXPLICIT
        VocabularySelectionSource.FORGOTTEN in matches -> PracticeSelectionReason.LAPSED
        VocabularySelectionSource.DIFFICULT in matches -> PracticeSelectionReason.DIFFICULT
        VocabularySelectionSource.DUE in matches -> PracticeSelectionReason.DUE_TODAY
        VocabularySelectionSource.RECENT in matches -> PracticeSelectionReason.RECENT_LESSON
        VocabularySelectionSource.FAVORITE in matches -> PracticeSelectionReason.FAVORITE
        VocabularySelectionSource.LESSON in matches -> PracticeSelectionReason.LESSON
        VocabularySelectionSource.COURSE in matches -> PracticeSelectionReason.COURSE
        VocabularySelectionSource.NEW in matches -> PracticeSelectionReason.NEW
        else -> PracticeSelectionReason.FULL_DICTIONARY
    }
}

@Component
class VocabularyIndexedSelectionLookup(
    private val entries: VocabularyEntryRepo,
    private val occurrences: VocabularyOccurrenceRepo,
    private val states: VocabularySkillStateRepo,
) {
    fun candidateIds(ownerSubject: String, criteria: VocabularySelectionCriteriaRequest, now: Instant): Set<UUID>? {
        if (criteria.sources.any { it in setOf(VocabularySelectionSource.NEW, VocabularySelectionSource.FULL_DICTIONARY) }) return null
        return criteria.sources.flatMapTo(linkedSetOf()) { source ->
            when (source) {
                VocabularySelectionSource.RECENT -> {
                    val since = now.minus(criteria.recentDays.toLong(), ChronoUnit.DAYS)
                    entries.findAllByOwnerSubjectAndStatusAndUpdatedAtGreaterThanEqual(ownerSubject, EntryStatus.ACTIVE, since).map { it.id } +
                        occurrences.findEntryIdsByOwnerSubjectAndCreatedAtAfter(ownerSubject, since)
                }
                VocabularySelectionSource.DUE -> states.findDueEntryIds(ownerSubject, now)
                VocabularySelectionSource.FORGOTTEN -> states.findEntryIdsByReviewReason(ownerSubject, MemoryReviewReason.LAPSED.name)
                VocabularySelectionSource.DIFFICULT -> (
                    states.findEntryIdsByReviewReason(ownerSubject, MemoryReviewReason.DIFFICULT.name) +
                        states.findDifficultEntryIds(ownerSubject, BigDecimal("0.5500"))
                    ).distinct()
                VocabularySelectionSource.FAVORITE -> entries.findAllByOwnerSubjectAndStatusAndFavoriteTrue(ownerSubject, EntryStatus.ACTIVE).map { it.id }
                VocabularySelectionSource.LESSON -> criteria.lessonId?.let { occurrences.findEntryIdsByOwnerSubjectAndLessonId(ownerSubject, it) }.orEmpty()
                VocabularySelectionSource.COURSE -> criteria.courseId?.let { occurrences.findEntryIdsByOwnerSubjectAndCourseId(ownerSubject, it) }.orEmpty()
                VocabularySelectionSource.EXPLICIT -> entries.findAllByOwnerSubjectAndIdIn(ownerSubject, criteria.explicitEntryIds).map { it.id }
                VocabularySelectionSource.NEW, VocabularySelectionSource.FULL_DICTIONARY -> emptyList()
            }
        }
    }
}
