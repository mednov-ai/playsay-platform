package com.playsay.vocabulary.service

import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.util.lexicalSenseKey
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class VocabularyLexicalBackfillResult(
    val linkedEntryIds: List<UUID>,
    val skippedAmbiguousEntryIds: List<UUID>,
    val skippedUnresolvedEntryIds: List<UUID>,
)

@Service
class VocabularyLexicalBackfillService(
    private val entries: VocabularyEntryRepo,
    private val lexicalIdentity: VocabularyLexicalIdentityService,
) {
    @Transactional
    fun backfill(): VocabularyLexicalBackfillResult {
        val unresolved = entries.findAllByLexicalSenseIdIsNullOrderByIdAsc()
        val linked = mutableListOf<UUID>()
        val ambiguous = mutableListOf<UUID>()
        val withoutMeaning = mutableListOf<UUID>()
        unresolved.groupBy { entry ->
            listOf(entry.ownerSubject, entry.sourceLanguage, entry.targetLanguage, entry.normalizedSource).joinToString("\u0000")
        }.values.forEach { group ->
            val keys = group.map { entry ->
                lexicalSenseKey(entry.sourceText, entry.sourceLanguage, entry.targetLanguage, entry.translation, entry.partOfSpeech)
            }
            if (keys.all { it == null }) {
                withoutMeaning += group.map { it.id }
            } else if (keys.any { it == null } || keys.filterNotNull().distinct().size != 1) {
                ambiguous += group.map { it.id }
            } else {
                group.forEach { entry ->
                    val resolved = lexicalIdentity.resolveLearnerContent(
                        ownerSubject = entry.ownerSubject,
                        actorSubject = entry.createdBySubject,
                        sourceText = entry.sourceText,
                        sourceLanguage = entry.sourceLanguage,
                        targetLanguage = entry.targetLanguage,
                        translation = entry.translation,
                        partOfSpeech = entry.partOfSpeech,
                        example = entry.example,
                        exampleTranslation = entry.exampleTranslation,
                    ) ?: return@forEach
                    entry.lexicalSenseId = resolved.sense.id
                    entry.lexicalContentRevisionId = resolved.content.id
                    entries.save(entry)
                    linked += entry.id
                }
            }
        }
        return VocabularyLexicalBackfillResult(linked, ambiguous, withoutMeaning)
    }
}

@Component
@ConditionalOnProperty(prefix = "playsay.vocabulary.features", name = ["lexical-backfill-enabled"], havingValue = "true")
class VocabularyLexicalBackfillRunner(
    private val backfill: VocabularyLexicalBackfillService,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        val result = backfill.backfill()
        logger.info(
            "Vocabulary lexical backfill completed: linked={}, ambiguous={}, unresolved={}",
            result.linkedEntryIds.size,
            result.skippedAmbiguousEntryIds.size,
            result.skippedUnresolvedEntryIds.size,
        )
    }

    private companion object {
        val logger = LoggerFactory.getLogger(VocabularyLexicalBackfillRunner::class.java)
    }
}
