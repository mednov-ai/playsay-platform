package com.playsay.keyboard.service

import com.playsay.keyboard.dto.FocusLessonResponse
import com.playsay.keyboard.entity.ChordSetEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import org.springframework.stereotype.Component

@Component
class FocusLessonRecommendationService(
    private val inputCodec: TrainingInputCodec,
) {
    fun recommend(
        saved: TrainingResultEntity,
        recentResults: List<TrainingResultEntity>,
        chordSet: ChordSetEntity,
    ): FocusLessonResponse? {
        val severeKeys = severeProblemKeys(saved)
        if (severeKeys.isNotEmpty()) return buildFocusLesson(chordSet, "SEVERE", severeKeys)
        val moderateKeys = moderateProblemKeys(recentResults.takeWhile { it.lessonKind != "FOCUS" }.take(5))
        if (moderateKeys.isNotEmpty()) return buildFocusLesson(chordSet, "MODERATE", moderateKeys)
        return null
    }

    private fun severeProblemKeys(result: TrainingResultEntity): List<String> {
        val chordKeys = result.perChord.filterValues { errors -> errors >= 3 }.entries
        val charKeys = result.perChar.filterValues { errors -> errors >= 4 }.entries
        return (chordKeys + charKeys)
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
            .map(Map.Entry<String, Int>::key)
            .distinct()
            .take(3)
    }

    private fun moderateProblemKeys(results: List<TrainingResultEntity>): List<String> {
        if (results.size < 3) return emptyList()
        val totals = mutableMapOf<String, Int>()
        val sessions = mutableMapOf<String, Int>()
        results.forEach { result ->
            mergeProblemMaps(result).forEach { (key, count) ->
                if (count > 0) {
                    totals[key] = (totals[key] ?: 0) + count
                    sessions[key] = (sessions[key] ?: 0) + 1
                }
            }
        }
        return totals.keys
            .filter { key ->
                val sessionCount = sessions[key] ?: 0
                sessionCount >= 3 || ((totals[key] ?: 0) >= 5 && sessionCount >= 2)
            }
            .sortedWith(compareByDescending<String> { key -> totals[key] ?: 0 }.thenBy { it })
            .take(3)
    }

    private fun mergeProblemMaps(result: TrainingResultEntity): Map<String, Int> {
        val merged = mutableMapOf<String, Int>()
        (result.perChord.entries + result.perChar.entries).forEach { entry ->
            merged[entry.key] = (merged[entry.key] ?: 0) + entry.value
        }
        return merged
    }

    private fun buildFocusLesson(
        chordSet: ChordSetEntity,
        reason: String,
        problemKeys: List<String>,
    ): FocusLessonResponse {
        val cleanKeys = inputCodec.problemKeys(problemKeys)
        return FocusLessonResponse(
            sourceChordSetId = chordSet.id,
            layout = chordSet.layout,
            reason = reason,
            problemKeys = cleanKeys,
            chords = buildFocusChords(cleanKeys, chordSet.chords),
            title = "Focus: ${cleanKeys.joinToString(" ")}",
        )
    }

    private fun buildFocusChords(problemKeys: List<String>, fallbackChords: List<String>): List<String> {
        val combos = problemCombinations(problemKeys)
        val cleanedFallback = fallbackChords.asSequence().map(String::trim).filter(String::isNotEmpty).distinct().toList()
        if (combos.isEmpty()) return repeatToFocusCount(cleanedFallback)
        val problemPart = combos.take(FOCUS_CHORD_COUNT / 2)
        val supportingPart = cleanedFallback
            .filterNot(combos::contains)
            .sortedWith(compareByDescending<String> { supportScore(it, problemKeys) }.thenBy { it })
        val mixed = mutableListOf<String>()
        var problemIndex = 0
        var supportIndex = 0
        while (mixed.size < FOCUS_CHORD_COUNT && (problemIndex < problemPart.size || supportIndex < supportingPart.size)) {
            if (supportIndex < supportingPart.size) mixed += supportingPart[supportIndex++]
            if (mixed.size < FOCUS_CHORD_COUNT && problemIndex < problemPart.size) mixed += problemPart[problemIndex++]
        }
        while (mixed.size < FOCUS_CHORD_COUNT && cleanedFallback.isNotEmpty()) {
            mixed += cleanedFallback[mixed.size % cleanedFallback.size]
        }
        while (mixed.size < FOCUS_CHORD_COUNT && problemPart.isNotEmpty()) {
            mixed += problemPart[mixed.size % problemPart.size]
        }
        return mixed.take(FOCUS_CHORD_COUNT)
    }

    private fun problemCombinations(problemKeys: List<String>): LinkedHashSet<String> =
        linkedSetOf<String>().apply {
            problemKeys.forEach { key ->
                add(key)
                if (key.length == 1) {
                    add(key + key)
                } else {
                    add(key.reversed())
                    key.forEach { char -> add("$char$char") }
                }
            }
            problemKeys.forEach { left ->
                problemKeys.forEach { right ->
                    if (left != right && left.length == 1 && right.length == 1) add(left + right)
                }
            }
        }

    private fun repeatToFocusCount(chords: List<String>): List<String> {
        if (chords.isEmpty()) return emptyList()
        val repeated = mutableListOf<String>()
        while (repeated.size < FOCUS_CHORD_COUNT) {
            chords.forEach { chord -> if (repeated.size < FOCUS_CHORD_COUNT) repeated += chord }
        }
        return repeated
    }

    private fun supportScore(chord: String, problemKeys: List<String>): Int =
        problemKeys.maxOfOrNull { key ->
            when {
                key.isNotEmpty() && chord.contains(key) -> 4
                key.length > 1 && (chord.startsWith(key.first()) || chord.endsWith(key.last())) -> 3
                key.any(chord::contains) -> 2
                else -> 0
            }
        } ?: 0

    private companion object {
        const val FOCUS_CHORD_COUNT = 32
    }
}
