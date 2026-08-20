package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeMode
import com.playsay.vocabulary.dto.PracticeReadinessWarning
import com.playsay.vocabulary.dto.PracticeSelectionReason
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import java.text.Normalizer
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Locale
import java.util.UUID
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component

@Component
class VocabularyPracticePlanner(
    private val exercisePolicy: VocabularyExercisePlanningPolicy = ContentAwareExercisePlanningPolicy(),
    private val meters: MeterRegistry? = null,
    private val selectionResolver: VocabularySelectionResolver = VocabularySelectionResolver(),
) {
    fun planOwner(
        ownerSubject: String,
        ownerEntries: List<VocabularyEntryEntity>,
        statesByEntry: Map<UUID, List<VocabularySkillStateEntity>>,
        request: VocabularyPracticeSettingsRequest,
        seed: UUID,
        now: Instant,
        recentLessonEntryIds: Set<UUID> = emptySet(),
    ): PlannedOwnerPractice {
        val ownerOverride = request.ownerOverrides.firstOrNull { it.ownerSubject.trim() == ownerSubject }
        val pinnedIds = ownerOverride?.pinnedEntryIds ?: request.pinnedEntryIds
        val excludedIds = ownerOverride?.excludedEntryIds ?: request.excludedEntryIds
        val baseEligible = ownerEntries.filter { entry ->
            entry.status == EntryStatus.ACTIVE &&
                !entry.practicePaused &&
                !entry.translation.isNullOrBlank()
        }
        val resolution = selectionResolver.resolve(baseEligible, statesByEntry, request.selection, now)
        val eligible = (resolution.eligibleEntries + baseEligible.filter { it.id in pinnedIds }).distinctBy { it.id }
        val byId = eligible.associateBy(VocabularyEntryEntity::id)
        val durationLimit = request.selection?.targetMinutes?.times(2)
        val effectiveWordLimit = durationLimit?.let { minOf(request.wordLimit, it.coerceAtLeast(1)) } ?: request.wordLimit
        val selected = selectPracticeEntryIds(
            candidates = eligible.map { entry ->
                VocabularySelectionCandidate(
                    id = entry.id,
                    dueAt = entryDueAt(entry, statesByEntry[entry.id].orEmpty()),
                    stage = aggregateVocabularyStage(statesByEntry[entry.id].orEmpty()),
                    updatedAt = entry.updatedAt,
                    priority = selectionPriority(entry, statesByEntry[entry.id].orEmpty(), recentLessonEntryIds, now),
                )
            },
            wordLimit = effectiveWordLimit,
            pinnedEntryIds = pinnedIds,
            excludedEntryIds = excludedIds,
            now = now,
            maxNewItems = request.selection?.maxNewItems ?: 3,
        ).mapNotNull(byId::get)

        val reasons = selected.associate { entry ->
            entry.id to if (entry.id in pinnedIds) {
                PracticeSelectionReason.PINNED
            } else {
                resolution.reasons[entry.id]
                    ?: selectionReason(entry, statesByEntry[entry.id].orEmpty(), pinnedIds, recentLessonEntryIds, now)
            }
        }
        reasons.values.groupingBy { it }.eachCount().forEach { (reason, count) ->
            meters?.counter(
                "playsay.vocabulary.selection.reason",
                "reason",
                reason.name,
                "delivery",
                request.delivery.name,
            )?.increment(count.toDouble())
        }
        val distractors = eligible.mapNotNull(VocabularyEntryEntity::translation).distinctBy(::normalizeAnswer)
        val perEntry = selected.mapIndexed { index, entry ->
            itemsForEntry(
                entry = entry,
                stage = aggregateVocabularyStage(statesByEntry[entry.id].orEmpty()),
                entryStates = statesByEntry[entry.id].orEmpty(),
                mode = request.mode,
                availableTranslations = distractors,
                index = index,
                seed = seed,
                reason = reasons.getValue(entry.id),
            ).filter { planned ->
                val preferred = request.selection?.preferredSkills.orEmpty()
                preferred.isEmpty() || planned.skill in preferred || (planned.type == PracticeExerciseType.FLASHCARD && planned.entryId != null)
            }
        }
        val interleaved = buildList {
            val newEntries = selected.filter { aggregateVocabularyStage(statesByEntry[it.id].orEmpty()) == LearningStage.NEW }
            matchingItem(newEntries, seed)?.let(::add)
            val rounds = perEntry.maxOfOrNull(List<PlannedPracticeItem>::size) ?: 0
            repeat(rounds) { round ->
                perEntry.forEach { ownerItems -> ownerItems.getOrNull(round)?.let(::add) }
            }
        }
        interleaved.groupingBy { it.skill to it.type }.eachCount().forEach { (composition, count) ->
            listOf("legacy-v1", exercisePolicy.version).distinct().forEach { policyVersion ->
                meters?.counter(
                    "playsay.vocabulary.policy.session.composition",
                    "policy",
                    policyVersion,
                    "skill",
                    composition.first.name,
                    "exercise",
                    composition.second.name,
                )?.increment(count.toDouble())
            }
        }
        return PlannedOwnerPractice(
            ownerSubject = ownerSubject,
            selected = selected.map { entry ->
                PlannedEntrySelection(
                    entryId = entry.id,
                    reason = reasons.getValue(entry.id),
                    warnings = readinessWarnings(entry, distractors),
                )
            },
            items = interleaved,
            exclusions = resolution.exclusions,
            categoryCounts = resolution.categoryCounts,
        )
    }

    private fun itemsForEntry(
        entry: VocabularyEntryEntity,
        stage: LearningStage,
        entryStates: List<VocabularySkillStateEntity>,
        mode: PracticeMode,
        availableTranslations: List<String>,
        index: Int,
        seed: UUID,
        reason: PracticeSelectionReason,
    ): List<PlannedPracticeItem> {
        if (mode == PracticeMode.KEYBOARD) {
            return listOf(item(entry, VocabularySkill.SPELLING, PracticeExerciseType.KEYBOARD, entry.sourceText, entry.sourceText, reason = reason))
        }
        val meaningOptions = deterministicOptions(entry.translation.orEmpty(), availableTranslations, seed, index)
        val canChooseMeaning = meaningOptions.size >= 4
        val productive = productiveItem(entry, reason)
        val primary = when {
            mode == PracticeMode.WRITING -> productive
            stage == LearningStage.NEW -> item(
                entry,
                VocabularySkill.MEANING,
                PracticeExerciseType.FLASHCARD,
                entry.sourceText,
                entry.translation.orEmpty(),
                reason = reason,
            )
            stage == LearningStage.LEARNING && canChooseMeaning -> item(
                entry,
                VocabularySkill.MEANING,
                PracticeExerciseType.MEANING_CHOICE,
                entry.sourceText,
                entry.translation.orEmpty(),
                options = meaningOptions,
                reason = reason,
            )
            stage == LearningStage.LEARNING -> productive
            else -> {
                val formInterval = entryStates.firstOrNull { it.skill == VocabularySkill.FORM }?.intervalIndex ?: 0
                val contextInterval = entryStates.firstOrNull { it.skill == VocabularySkill.CONTEXT }?.intervalIndex ?: 0
                if (mode == PracticeMode.QUICK && contextInterval < formInterval) contextItem(entry, reason) ?: productive else productive
            }
        }
        val secondary = when {
            mode == PracticeMode.QUICK -> null
            mode == PracticeMode.WRITING -> contextItem(entry, reason)
                ?: phraseItem(entry, seed, index, reason)
                ?: if (primary.type != PracticeExerciseType.FORM_INPUT) productive else null
            stage == LearningStage.NEW && canChooseMeaning -> item(
                entry,
                VocabularySkill.MEANING,
                PracticeExerciseType.MEANING_CHOICE,
                entry.sourceText,
                entry.translation.orEmpty(),
                options = meaningOptions,
                reason = reason,
            )
            stage == LearningStage.NEW -> productive
            stage == LearningStage.LEARNING -> productive.takeUnless { primary.type == PracticeExerciseType.FORM_INPUT }
            contextItem(entry, reason) != null -> contextItem(entry, reason)
            else -> phraseItem(entry, seed, index, reason)
        }
        return listOfNotNull(primary, secondary)
    }

    private fun matchingItem(entries: List<VocabularyEntryEntity>, seed: UUID): PlannedPracticeItem? {
        val pairs = entries
            .filter { !it.translation.isNullOrBlank() }
            .distinctBy { normalizeAnswer(it.translation) }
            .take(6)
        if (pairs.size < 2) return null
        val left = pairs.map { entry ->
            mapOf("id" to matchingOptionId(seed, "left", entry.id), "label" to entry.sourceText)
        }
        val right = pairs.map { entry ->
            mapOf("id" to matchingOptionId(seed, "right", entry.id), "label" to entry.translation.orEmpty())
        }
            .sortedBy { it.getValue("id").hashCode().toLong() xor seed.leastSignificantBits }
        val answer = pairs
            .map { entry ->
                matchingOptionId(seed, "left", entry.id) to matchingOptionId(seed, "right", entry.id)
            }
            .sortedBy(Pair<String, String>::first)
            .joinToString("|") { (leftId, rightId) -> "$leftId:$rightId" }
        return PlannedPracticeItem(
            entryId = null,
            skill = VocabularySkill.MEANING,
            type = PracticeExerciseType.MATCHING,
            prompt = "",
            answer = answer,
            acceptedAnswers = listOf(answer),
            content = mapOf("type" to "MATCHING", "left" to left, "right" to right),
            affectsSchedule = false,
            snapshot = emptyMap(),
            selectionReason = PracticeSelectionReason.NEW,
        )
    }

    private fun productiveItem(entry: VocabularyEntryEntity, reason: PracticeSelectionReason) =
        item(entry, VocabularySkill.FORM, PracticeExerciseType.FORM_INPUT, entry.translation.orEmpty(), entry.sourceText, reason = reason)

    private fun phraseItem(
        entry: VocabularyEntryEntity,
        seed: UUID,
        index: Int,
        reason: PracticeSelectionReason,
    ): PlannedPracticeItem? {
        val parts = entry.sourceText.trim().split(Regex("\\s+")).filter(String::isNotBlank)
        if (parts.size < 2) return null
        val tokens = parts.mapIndexed { tokenIndex, part ->
            mapOf(
                "id" to UUID.nameUUIDFromBytes("$seed:phrase:${entry.id}:$tokenIndex".toByteArray()).toString(),
                "label" to part,
            )
        }
            .sortedBy { it.getValue("id").hashCode().toLong() xor seed.mostSignificantBits xor index.toLong() }
        return item(
            entry = entry,
            skill = VocabularySkill.FORM,
            type = PracticeExerciseType.PHRASE_BUILDER,
            prompt = entry.translation.orEmpty(),
            answer = entry.sourceText,
            options = tokens.map { it.getValue("label") },
            content = mapOf("type" to "PHRASE_BUILDER", "tokens" to tokens),
            reason = reason,
        )
    }

    private fun contextItem(entry: VocabularyEntryEntity, reason: PracticeSelectionReason): PlannedPracticeItem? {
        val match = exactContextMatch(entry) ?: return null
        val example = entry.example?.trim().orEmpty()
        return item(
            entry,
            VocabularySkill.CONTEXT,
            PracticeExerciseType.CONTEXT_GAP,
            example.replaceRange(match.range, "___"),
            match.value,
            reason = reason,
        )
    }

    private fun item(
        entry: VocabularyEntryEntity,
        skill: VocabularySkill,
        type: PracticeExerciseType,
        prompt: String,
        answer: String,
        options: List<String> = emptyList(),
        content: Map<String, Any?> = mapOf("type" to type.name),
        affectsSchedule: Boolean = true,
        reason: PracticeSelectionReason,
    ) = PlannedPracticeItem(
        entryId = entry.id,
        lexicalContentRevisionId = entry.lexicalContentRevisionId,
        skill = skill,
        type = type,
        prompt = prompt,
        answer = answer,
        acceptedAnswers = listOf(answer),
        options = options,
        content = content,
        affectsSchedule = affectsSchedule,
        snapshot = mapOf(
            "sourceText" to entry.sourceText,
            "translation" to entry.translation,
            "example" to entry.example,
            "exampleTranslation" to entry.exampleTranslation,
        ),
        selectionReason = reason,
    )

    private fun readinessWarnings(
        entry: VocabularyEntryEntity,
        translations: List<String>,
    ): Set<PracticeReadinessWarning> = buildSet {
        if (entry.translation.isNullOrBlank()) add(PracticeReadinessWarning.MISSING_TRANSLATION)
        if (exactContextMatch(entry) == null) add(PracticeReadinessWarning.MISSING_EXACT_EXAMPLE)
        val otherTranslations = translations.count { normalizeAnswer(it) != normalizeAnswer(entry.translation) }
        if (otherTranslations < 3) add(PracticeReadinessWarning.INSUFFICIENT_DISTRACTORS)
    }

    private fun selectionReason(
        entry: VocabularyEntryEntity,
        states: List<VocabularySkillStateEntity>,
        pinnedIds: List<UUID>,
        recentLessonEntryIds: Set<UUID>,
        now: Instant,
    ): PracticeSelectionReason {
        if (entry.id in pinnedIds) return PracticeSelectionReason.PINNED
        val dueAt = entryDueAt(entry, states)
        if (dueAt.isBefore(now.truncatedTo(ChronoUnit.DAYS))) return PracticeSelectionReason.OVERDUE
        if (!dueAt.isAfter(now)) return PracticeSelectionReason.DUE_TODAY
        if (entry.id in recentLessonEntryIds) return PracticeSelectionReason.RECENT_LESSON
        return if (aggregateVocabularyStage(states) == LearningStage.NEW) PracticeSelectionReason.NEW else PracticeSelectionReason.CONTROL_REVIEW
    }

    private fun selectionPriority(
        entry: VocabularyEntryEntity,
        states: List<VocabularySkillStateEntity>,
        recentLessonEntryIds: Set<UUID>,
        now: Instant,
    ): Int {
        val dueAt = entryDueAt(entry, states)
        return when {
            !dueAt.isAfter(now) -> 0
            dueAt.isBefore(now.plus(1, ChronoUnit.DAYS)) -> 1
            entry.id in recentLessonEntryIds -> 2
            aggregateVocabularyStage(states) == LearningStage.NEW -> 3
            aggregateVocabularyStage(states) == LearningStage.MASTERED -> 4
            else -> 5
        }
    }

    private fun entryDueAt(entry: VocabularyEntryEntity, states: List<VocabularySkillStateEntity>): Instant {
        val required = states.filter { state ->
            state.skill in setOf(VocabularySkill.MEANING, VocabularySkill.FORM) ||
                (state.skill == VocabularySkill.CONTEXT && exercisePolicy.isSkillAvailable(entry, VocabularySkill.CONTEXT))
        }
        return required.minOfOrNull(VocabularySkillStateEntity::dueAt) ?: entry.createdAt
    }

    private fun exactContextMatch(entry: VocabularyEntryEntity): MatchResult? {
        val example = entry.example?.trim().orEmpty()
        val sourceText = entry.sourceText.trim()
        if (example.isEmpty() || sourceText.isEmpty()) return null
        val exactForm = "(?<![\\p{L}\\p{N}'’-])${Regex.escape(sourceText)}(?![\\p{L}\\p{N}'’-])"
        return Regex(exactForm, RegexOption.IGNORE_CASE).find(example)
    }

    private fun deterministicOptions(answer: String, available: List<String>, seed: UUID, salt: Int): List<String> {
        val others = available.filterNot { normalizeAnswer(it) == normalizeAnswer(answer) }
            .sortedBy { option -> option.hashCode().toLong() xor seed.leastSignificantBits xor salt.toLong() }
            .take(3)
        if (others.size < 3) return emptyList()
        return (others + answer)
            .distinct()
            .sortedBy { option -> option.hashCode().toLong() xor seed.mostSignificantBits xor salt.toLong() }
    }

    private fun matchingOptionId(seed: UUID, side: String, entryId: UUID): String =
        UUID.nameUUIDFromBytes("$seed:$side:$entryId".toByteArray()).toString()

    private fun normalizeAnswer(value: String?): String = Normalizer.normalize(value.orEmpty(), Normalizer.Form.NFKC)
        .lowercase(Locale.ROOT)
        .replace('’', '\'')
        .replace(Regex("[\\s\\p{Punct}]+"), " ")
        .trim()
}

data class PlannedOwnerPractice(
    val ownerSubject: String,
    val selected: List<PlannedEntrySelection>,
    val items: List<PlannedPracticeItem>,
    val exclusions: Map<UUID, String> = emptyMap(),
    val categoryCounts: Map<String, Int> = emptyMap(),
)

data class PlannedEntrySelection(
    val entryId: UUID,
    val reason: PracticeSelectionReason,
    val warnings: Set<PracticeReadinessWarning> = emptySet(),
)

data class PlannedPracticeItem(
    val entryId: UUID?,
    val lexicalContentRevisionId: UUID? = null,
    val skill: VocabularySkill,
    val type: PracticeExerciseType,
    val prompt: String,
    val answer: String,
    val acceptedAnswers: List<String> = emptyList(),
    val options: List<String> = emptyList(),
    val content: Map<String, Any?> = emptyMap(),
    val affectsSchedule: Boolean,
    val snapshot: Map<String, String?>,
    val selectionReason: PracticeSelectionReason,
)
