package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.LexicalCatalogScope
import com.playsay.vocabulary.dto.LexicalImageability
import com.playsay.vocabulary.dto.VocabularyMediaAssetState
import com.playsay.vocabulary.dto.VocabularyMediaGenerationState
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyLexicalSenseRepo
import com.playsay.vocabulary.repo.VocabularyMediaAssetRepo
import com.playsay.vocabulary.repo.VocabularyMediaGenerationRequestRepo
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class VocabularySharedSensePromotionResult(
    val promotedSenseIds: List<UUID>,
    val relinkedEntryIds: List<UUID>,
    val skippedActiveGenerationSenseIds: List<UUID>,
)

@Service
class VocabularySharedSensePromotionService(
    private val senses: VocabularyLexicalSenseRepo,
    private val entries: VocabularyEntryRepo,
    private val assets: VocabularyMediaAssetRepo,
    private val generations: VocabularyMediaGenerationRequestRepo,
    private val lexicalIdentity: VocabularyLexicalIdentityService,
) {
    /**
     * Idempotently promotes legacy learner-scoped identities. A sense with in-flight
     * generation is left untouched so a worker can finish against a consistent identity;
     * a later run can promote it safely.
     */
    @Transactional
    fun promote(): VocabularySharedSensePromotionResult {
        val promoted = mutableListOf<UUID>()
        val relinked = mutableListOf<UUID>()
        val skipped = mutableListOf<UUID>()

        senses.findAllByCatalogScopeOrderByIdAsc(LexicalCatalogScope.LEARNER).forEach legacySenseLoop@ { legacySense ->
            val legacyGenerations = generations.findAllBySenseIdOrderByCreatedAtAsc(legacySense.id)
            if (legacyGenerations.any { it.state in setOf(VocabularyMediaGenerationState.PENDING, VocabularyMediaGenerationState.PROCESSING) }) {
                skipped += legacySense.id
                return@legacySenseLoop
            }
            val legacyEntries = entries.findAllByLexicalSenseIdOrderByIdAsc(legacySense.id)
            if (legacyEntries.isEmpty()) return@legacySenseLoop

            var sharedSenseId: UUID? = null
            legacyEntries.forEach entryLoop@ { entry ->
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
                ) ?: return@entryLoop
                sharedSenseId = resolved.sense.id
                entry.lexicalSenseId = resolved.sense.id
                entry.lexicalContentRevisionId = resolved.content.id
                entries.save(entry)
                relinked += entry.id
            }

            val targetId = sharedSenseId ?: return@legacySenseLoop
            val targetSense = senses.findById(targetId).orElseThrow()
            if (targetSense.imageability == LexicalImageability.UNKNOWN && legacySense.imageability != LexicalImageability.UNKNOWN) {
                targetSense.imageability = legacySense.imageability
                senses.save(targetSense)
            }
            assets.findAllBySenseIdOrderByCreatedAtDesc(legacySense.id).forEach { asset ->
                asset.senseId = targetId
                asset.catalogScope = targetSense.catalogScope
                asset.scopeKey = targetSense.scopeKey
                assets.save(asset)
            }
            legacyGenerations.forEach { request ->
                request.senseId = targetId
                request.activeFirstUseKey = null
                generations.save(request)
            }
            val approved = assets.findAllBySenseIdOrderByCreatedAtDesc(targetId)
                .filter { it.state == VocabularyMediaAssetState.APPROVED }
                .sortedWith(compareByDescending<com.playsay.vocabulary.entity.VocabularyMediaAssetEntity> { it.approvedAt }.thenByDescending { it.createdAt })
            approved.drop(1).forEach { duplicate ->
                duplicate.state = VocabularyMediaAssetState.SUPERSEDED
                assets.save(duplicate)
            }
            promoted += legacySense.id
        }
        return VocabularySharedSensePromotionResult(promoted, relinked, skipped)
    }
}

@Component
@ConditionalOnProperty(prefix = "playsay.vocabulary.features", name = ["shared-sense-promotion-enabled"], havingValue = "true")
class VocabularySharedSensePromotionRunner(
    private val promotion: VocabularySharedSensePromotionService,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        val result = promotion.promote()
        logger.info(
            "Vocabulary shared-sense promotion completed: senses={}, entries={}, skippedActive={}",
            result.promotedSenseIds.size,
            result.relinkedEntryIds.size,
            result.skippedActiveGenerationSenseIds.size,
        )
    }

    private companion object {
        val logger = LoggerFactory.getLogger(VocabularySharedSensePromotionRunner::class.java)
    }
}
