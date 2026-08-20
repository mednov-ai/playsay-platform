package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.VocabularyKeyMode
import com.playsay.vocabulary.dto.VocabularyKeyNgramSettingsRequest
import com.playsay.vocabulary.dto.VocabularyKeySourceOffsetResponse
import com.playsay.vocabulary.dto.VocabularyKeyTargetType
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.UUID
import org.springframework.stereotype.Component

data class VocabularyKeySource(
    val entryId: UUID,
    val itemId: UUID,
    val text: String,
)

data class MaterializedVocabularyKeyTarget(
    val id: UUID,
    val position: Int,
    val type: VocabularyKeyTargetType,
    val text: String,
    val sourceEntryIds: List<UUID>,
    val sourceItemIds: List<UUID>,
    val offsets: List<VocabularyKeySourceOffsetResponse>,
)

data class VocabularyKeyMaterialization(
    val targets: List<MaterializedVocabularyKeyTarget>,
    val exclusions: Map<UUID, String>,
)

@Component
class VocabularyKeyMaterializer {
    fun materialize(
        sources: List<VocabularyKeySource>,
        mode: VocabularyKeyMode,
        settings: VocabularyKeyNgramSettingsRequest,
        seed: Long,
        version: String,
        weakPatterns: Map<String, Int> = emptyMap(),
    ): VocabularyKeyMaterialization {
        require(settings.minLength <= settings.maxLength) { "Minimum n-gram length must not exceed maximum length." }
        val normalized = sources.mapNotNull { source ->
            normalizeSource(source.text)?.let { text -> NormalizedSource(source, text) }
        }
        val eligibleIds = normalized.mapTo(mutableSetOf()) { it.source.entryId }
        val exclusions = sources
            .filter { it.entryId !in eligibleIds }
            .associate { it.entryId to "INVALID_KEYBOARD_LAYOUT" }
        val whole = normalized.map { source ->
            Candidate(
                type = VocabularyKeyTargetType.WHOLE_WORD,
                text = source.text,
                offsets = listOf(source.offset(0, source.text.length)),
            )
        }
        val ngrams = ngramCandidates(normalized, settings)
        val ordered = when (mode) {
            VocabularyKeyMode.WHOLE_WORDS -> seededOrder(whole, seed).take(settings.targetLimit)
            VocabularyKeyMode.CHARACTER_NGRAMS -> selectNgrams(ngrams, normalized, weakPatterns, seed, settings)
            VocabularyKeyMode.MIXED -> interleave(
                seededOrder(whole, seed xor WHOLE_SALT),
                selectNgrams(ngrams, normalized, weakPatterns, seed xor NGRAM_SALT, settings),
                settings.targetLimit,
            )
        }
        return VocabularyKeyMaterialization(
            targets = ordered.mapIndexed { position, candidate -> candidate.toTarget(position, seed, version) },
            exclusions = exclusions,
        )
    }

    fun normalizeSource(value: String): String? {
        val normalized = value
            .lowercase(Locale.ROOT)
            .replace('’', '\'')
            .replace('‘', '\'')
            .replace('–', '-')
            .replace('—', '-')
            .trim()
            .replace(Regex("\\s+"), " ")
        if (normalized.isBlank() || normalized.length > MAX_TARGET_LENGTH) return null
        if (!normalized.matches(Regex("[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*)*"))) return null
        return normalized
    }

    private fun ngramCandidates(
        sources: List<NormalizedSource>,
        settings: VocabularyKeyNgramSettingsRequest,
    ): List<Candidate> {
        val byText = linkedMapOf<String, MutableList<VocabularyKeySourceOffsetResponse>>()
        sources.forEach { source ->
            TOKEN.findAll(source.text).forEach { tokenMatch ->
                val token = tokenMatch.value
                for (length in settings.minLength..settings.maxLength) {
                    if (token.length < length) continue
                    for (start in 0..token.length - length) {
                        val value = token.substring(start, start + length)
                        if (value.none(Char::isLetter)) continue
                        byText.computeIfAbsent(value) { mutableListOf() }
                            .add(source.offset(tokenMatch.range.first + start, tokenMatch.range.first + start + length))
                    }
                }
            }
        }
        return byText.map { (text, offsets) ->
            Candidate(VocabularyKeyTargetType.CHARACTER_NGRAM, text, offsets.distinct())
        }
    }

    private fun selectNgrams(
        candidates: List<Candidate>,
        sources: List<NormalizedSource>,
        weakPatterns: Map<String, Int>,
        seed: Long,
        settings: VocabularyKeyNgramSettingsRequest,
    ): List<Candidate> {
        if (candidates.isEmpty()) return emptyList()
        val remaining = candidates.toMutableSet()
        val selected = mutableListOf<Candidate>()
        val uncovered = sources.mapTo(linkedSetOf()) { it.source.entryId }
        while (uncovered.isNotEmpty() && remaining.isNotEmpty() && selected.size < settings.targetLimit) {
            val next = remaining
                .filter { candidate -> candidate.entryIds.any(uncovered::contains) }
                .maxWithOrNull(candidateComparator(weakPatterns, seed)) ?: break
            selected += next
            remaining -= next
            uncovered.removeAll(next.entryIds.toSet())
        }
        val ranked = remaining.sortedWith(candidateComparator(weakPatterns, seed).reversed())
        selected += ranked.take((settings.targetLimit - selected.size).coerceAtLeast(0))
        if (settings.maxRepetitions <= 1 || selected.size >= settings.targetLimit) return avoidImmediateRepeats(selected)
        val repeats = selected
            .filter { (weakPatterns[it.text] ?: 0) > 0 }
            .sortedWith(candidateComparator(weakPatterns, seed).reversed())
            .flatMap { candidate -> List(settings.maxRepetitions - 1) { candidate } }
        return avoidImmediateRepeats((selected + repeats).take(settings.targetLimit))
    }

    private fun candidateComparator(weakPatterns: Map<String, Int>, seed: Long): Comparator<Candidate> =
        compareBy<Candidate> { candidate -> weakPatterns[candidate.text] ?: 0 }
            .thenBy { candidate -> candidate.entryIds.size }
            .thenBy { candidate -> stableRank(candidate, seed) }

    private fun seededOrder(candidates: List<Candidate>, seed: Long): List<Candidate> =
        candidates.sortedBy { candidate -> stableRank(candidate, seed) }

    private fun interleave(whole: List<Candidate>, ngrams: List<Candidate>, limit: Int): List<Candidate> {
        val result = mutableListOf<Candidate>()
        var wholeIndex = 0
        var ngramIndex = 0
        while (result.size < limit && (wholeIndex < whole.size || ngramIndex < ngrams.size)) {
            if (wholeIndex < whole.size) result += whole[wholeIndex++]
            if (result.size < limit && ngramIndex < ngrams.size) result += ngrams[ngramIndex++]
        }
        return avoidImmediateRepeats(result)
    }

    private fun avoidImmediateRepeats(input: List<Candidate>): List<Candidate> {
        val pending = input.toMutableList()
        val result = mutableListOf<Candidate>()
        while (pending.isNotEmpty()) {
            val index = pending.indexOfFirst { candidate -> result.lastOrNull()?.text != candidate.text }
                .takeIf { it >= 0 } ?: 0
            result += pending.removeAt(index)
        }
        return result
    }

    private fun stableRank(candidate: Candidate, seed: Long): Long {
        val uuid = UUID.nameUUIDFromBytes("$seed:${candidate.type}:${candidate.text}".toByteArray(StandardCharsets.UTF_8))
        return uuid.mostSignificantBits xor uuid.leastSignificantBits
    }

    private data class NormalizedSource(val source: VocabularyKeySource, val text: String) {
        fun offset(start: Int, endExclusive: Int) = VocabularyKeySourceOffsetResponse(
            entryId = source.entryId,
            itemId = source.itemId,
            start = start,
            endExclusive = endExclusive,
        )
    }

    private data class Candidate(
        val type: VocabularyKeyTargetType,
        val text: String,
        val offsets: List<VocabularyKeySourceOffsetResponse>,
    ) {
        val entryIds = offsets.map(VocabularyKeySourceOffsetResponse::entryId).distinct().sortedBy(UUID::toString)
        val itemIds = offsets.map(VocabularyKeySourceOffsetResponse::itemId).distinct().sortedBy(UUID::toString)

        fun toTarget(position: Int, seed: Long, version: String): MaterializedVocabularyKeyTarget {
            val identity = listOf(version, seed, position, type, text, entryIds.joinToString(), itemIds.joinToString()).joinToString("|")
            return MaterializedVocabularyKeyTarget(
                id = UUID.nameUUIDFromBytes(identity.toByteArray(StandardCharsets.UTF_8)),
                position = position,
                type = type,
                text = text,
                sourceEntryIds = entryIds,
                sourceItemIds = itemIds,
                offsets = offsets.sortedWith(compareBy({ it.entryId.toString() }, { it.itemId.toString() }, { it.start })),
            )
        }
    }

    private companion object {
        val TOKEN = Regex("[a-z]+(?:['-][a-z]+)*")
        const val MAX_TARGET_LENGTH = 120
        const val WHOLE_SALT = 0x57484f4c45L
        const val NGRAM_SALT = 0x4e4752414dL
    }
}
