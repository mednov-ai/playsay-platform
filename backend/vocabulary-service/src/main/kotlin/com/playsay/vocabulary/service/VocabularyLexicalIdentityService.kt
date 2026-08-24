package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.config.VocabularyCatalogProperties
import com.playsay.vocabulary.dto.LexicalCatalogScope
import com.playsay.vocabulary.dto.LexicalContentStatus
import com.playsay.vocabulary.entity.VocabularyLexicalContentRevisionEntity
import com.playsay.vocabulary.entity.VocabularyLexicalSenseEntity
import com.playsay.vocabulary.repo.VocabularyLexicalContentRevisionRepo
import com.playsay.vocabulary.repo.VocabularyLexicalSenseRepo
import com.playsay.vocabulary.util.lexicalSenseKey
import java.time.Instant
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class ResolvedLexicalContent(
    val sense: VocabularyLexicalSenseEntity,
    val content: VocabularyLexicalContentRevisionEntity,
)

data class VocabularyCatalogIdentity(
    val scope: LexicalCatalogScope,
    val scopeKey: String,
)

@Service
class VocabularyLexicalIdentityService(
    private val senses: VocabularyLexicalSenseRepo,
    private val revisions: VocabularyLexicalContentRevisionRepo,
    private val objectMapper: ObjectMapper,
    private val catalog: VocabularyCatalogProperties,
) {
    @Transactional
    fun resolveLearnerContent(
        ownerSubject: String,
        actorSubject: String,
        sourceText: String,
        sourceLanguage: String,
        targetLanguage: String,
        translation: String?,
        partOfSpeech: String?,
        example: String?,
        exampleTranslation: String?,
    ): ResolvedLexicalContent? {
        val key = lexicalSenseKey(sourceText, sourceLanguage, targetLanguage, translation, partOfSpeech) ?: return null
        val catalogIdentity = vocabularyCatalogIdentity(ownerSubject, catalog.schoolScopeKey)
        val catalogScope = catalogIdentity.scope
        val scopeKey = catalogIdentity.scopeKey
        val reusableExample = example.takeIf { catalogScope == LexicalCatalogScope.LEARNER }
        val reusableExampleTranslation = exampleTranslation.takeIf { catalogScope == LexicalCatalogScope.LEARNER }
        val now = Instant.now()
        val sense = senses.findByCatalogScopeAndScopeKeyAndSourceLanguageAndTargetLanguageAndNormalizedLemmaAndNormalizedPartOfSpeechAndNormalizedMeaning(
            catalogScope,
            scopeKey,
            key.sourceLanguage,
            key.targetLanguage,
            key.normalizedLemma,
            key.normalizedPartOfSpeech,
            key.normalizedMeaning,
        ) ?: senses.save(
            VocabularyLexicalSenseEntity(
                catalogScope = catalogScope,
                scopeKey = scopeKey,
                sourceLanguage = key.sourceLanguage,
                targetLanguage = key.targetLanguage,
                normalizedLemma = key.normalizedLemma,
                normalizedPartOfSpeech = key.normalizedPartOfSpeech,
                normalizedMeaning = key.normalizedMeaning,
                createdAt = now,
                updatedAt = now,
            ),
        )
        val current = revisions.findTopBySenseIdOrderByRevisionDesc(sense.id)
        if (current != null && current.matches(sourceText, translation, partOfSpeech, reusableExample, reusableExampleTranslation)) {
            return ResolvedLexicalContent(sense, current)
        }
        current?.status = LexicalContentStatus.SUPERSEDED
        current?.let(revisions::save)
        val revision = revisions.save(
            VocabularyLexicalContentRevisionEntity(
                senseId = sense.id,
                revision = (current?.revision ?: 0) + 1,
                sourceText = sourceText,
                translation = translation?.trim()?.takeIf(String::isNotEmpty),
                partOfSpeech = partOfSpeech?.trim()?.takeIf(String::isNotEmpty),
                example = reusableExample?.trim()?.takeIf(String::isNotEmpty),
                exampleTranslation = reusableExampleTranslation?.trim()?.takeIf(String::isNotEmpty),
                acceptedAnswersJson = objectMapper.writeValueAsString(listOfNotNull(translation?.trim()?.takeIf(String::isNotEmpty)).distinct()),
                createdBySubject = actorSubject.takeIf { catalogScope == LexicalCatalogScope.LEARNER },
                createdAt = now,
            ),
        )
        return ResolvedLexicalContent(sense, revision)
    }
}

fun vocabularyCatalogIdentity(ownerSubject: String, configuredSchoolScopeKey: String?): VocabularyCatalogIdentity {
    val schoolScopeKey = configuredSchoolScopeKey?.trim().orEmpty()
    return if (schoolScopeKey.isNotEmpty()) {
        VocabularyCatalogIdentity(LexicalCatalogScope.SCHOOL, schoolScopeKey)
    } else {
        VocabularyCatalogIdentity(LexicalCatalogScope.LEARNER, "learner:$ownerSubject")
    }
}

private fun VocabularyLexicalContentRevisionEntity.matches(
    sourceText: String,
    translation: String?,
    partOfSpeech: String?,
    example: String?,
    exampleTranslation: String?,
): Boolean =
    this.sourceText == sourceText &&
        this.translation == translation?.trim()?.takeIf(String::isNotEmpty) &&
        this.partOfSpeech == partOfSpeech?.trim()?.takeIf(String::isNotEmpty) &&
        this.example == example?.trim()?.takeIf(String::isNotEmpty) &&
        this.exampleTranslation == exampleTranslation?.trim()?.takeIf(String::isNotEmpty)
