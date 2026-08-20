package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.VocabularyKeyMode
import com.playsay.vocabulary.dto.VocabularyKeyNgramSettingsRequest
import com.playsay.vocabulary.dto.VocabularyKeyTargetType
import java.util.UUID
import kotlin.random.Random
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class VocabularyKeyMaterializerTest {
    private val materializer = VocabularyKeyMaterializer()

    @Test
    fun `normalizes whole words atomically and rejects unsupported layout text`() {
        val valid = source("we’ll-practice", "We’ll—Practice")
        val invalid = source("invalid", "привет")

        val result = materializer.materialize(
            listOf(valid, invalid),
            VocabularyKeyMode.WHOLE_WORDS,
            settings(),
            seed = 7,
            version = "v1",
        )

        assertEquals(listOf("we'll-practice"), result.targets.map { it.text })
        assertEquals(VocabularyKeyTargetType.WHOLE_WORD, result.targets.single().type)
        assertTrue(invalid.entryId in result.exclusions)
    }

    @Test
    fun `derives only bounded contiguous ngrams and preserves punctuation offsets`() {
        val source = source("phrase", "well-known phrase")
        val result = materializer.materialize(
            listOf(source),
            VocabularyKeyMode.CHARACTER_NGRAMS,
            settings(min = 2, max = 5, limit = 200),
            seed = 11,
            version = "v1",
        )

        assertTrue(result.targets.isNotEmpty())
        assertTrue(result.targets.all { it.text.length in 2..5 && ' ' !in it.text })
        assertTrue(result.targets.any { "-" in it.text })
        assertTrue(result.targets.all { target -> target.offsets.all { it.endExclusive - it.start == target.text.length } })
    }

    @Test
    fun `shared ngram retains every source attribution`() {
        val first = source("steady", "steady")
        val second = source("ready", "ready")
        val result = materializer.materialize(
            listOf(first, second),
            VocabularyKeyMode.CHARACTER_NGRAMS,
            settings(min = 4, max = 4, limit = 100),
            seed = 13,
            version = "v1",
        )

        val shared = result.targets.single { it.text == "eady" }
        assertEquals(setOf(first.entryId, second.entryId), shared.sourceEntryIds.toSet())
        assertEquals(2, shared.offsets.size)
    }

    @Test
    fun `seeded mixed stream is deterministic covers sources and keeps typed targets`() {
        val sources = listOf(source("steady", "steady"), source("practice", "practice"), source("rhythm", "rhythm"))
        val first = materializer.materialize(sources, VocabularyKeyMode.MIXED, settings(limit = 18), 42, "v2")
        val repeated = materializer.materialize(sources, VocabularyKeyMode.MIXED, settings(limit = 18), 42, "v2")
        val changedSeed = materializer.materialize(sources, VocabularyKeyMode.MIXED, settings(limit = 18), 43, "v2")

        assertEquals(first.targets, repeated.targets)
        assertNotEquals(first.targets.map { it.targetId() }, changedSeed.targets.map { it.targetId() })
        assertEquals(setOf(VocabularyKeyTargetType.WHOLE_WORD, VocabularyKeyTargetType.CHARACTER_NGRAM), first.targets.map { it.type }.toSet())
        assertEquals(sources.map { it.entryId }.toSet(), first.targets.flatMap { it.sourceEntryIds }.toSet())
        assertFalse(first.targets.zipWithNext().any { (left, right) -> left.text == right.text })
    }

    @Test
    fun `weak evidence changes priority while outage fallback remains deterministic`() {
        val sources = listOf(source("practice", "practice"), source("steady", "steady"))
        val neutral = materializer.materialize(sources, VocabularyKeyMode.CHARACTER_NGRAMS, settings(limit = 6), 77, "v1")
        val neutralAgain = materializer.materialize(sources, VocabularyKeyMode.CHARACTER_NGRAMS, settings(limit = 6), 77, "v1")
        val weighted = materializer.materialize(sources, VocabularyKeyMode.CHARACTER_NGRAMS, settings(limit = 6), 77, "v1", mapOf("act" to 20))

        assertEquals(neutral.targets, neutralAgain.targets)
        assertTrue(weighted.targets.any { it.text == "act" })
        assertTrue(weighted.targets.indexOfFirst { it.text == "act" } <= neutral.targets.indexOfFirst { it.text == "act" }.takeIf { it >= 0 } ?: Int.MAX_VALUE)
    }

    @Test
    fun `randomized eligible sources never violate ngram bounds or attribution`() {
        val random = Random(19)
        repeat(100) { iteration ->
            val text = (1..random.nextInt(2, 14)).joinToString("") { ('a' + random.nextInt(26)).toString() }
            val source = source("random-$iteration", text)
            val result = materializer.materialize(
                listOf(source),
                VocabularyKeyMode.CHARACTER_NGRAMS,
                settings(min = 2, max = 8, limit = 50),
                iteration.toLong(),
                "property-v1",
            )
            assertTrue(result.targets.all { target -> target.text.length in 2..8 && target.sourceEntryIds == listOf(source.entryId) })
        }
    }

    private fun settings(min: Int = 2, max: Int = 5, limit: Int = 64) = VocabularyKeyNgramSettingsRequest(
        minLength = min,
        maxLength = max,
        targetLimit = limit,
        maxRepetitions = 2,
    )

    private fun source(id: String, text: String) = VocabularyKeySource(
        entryId = UUID.nameUUIDFromBytes("entry-$id".toByteArray()),
        itemId = UUID.nameUUIDFromBytes("item-$id".toByteArray()),
        text = text,
    )

    private fun MaterializedVocabularyKeyTarget.targetId() = id
}
