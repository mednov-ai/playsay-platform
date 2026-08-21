package com.playsay.vocabulary.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.config.VocabularyFeatureProperties
import com.playsay.vocabulary.dto.LexicalImageability
import com.playsay.vocabulary.dto.VocabularyMediaAssetResponse
import com.playsay.vocabulary.dto.VocabularyMediaAssetState
import com.playsay.vocabulary.dto.VocabularyMediaGenerationState
import com.playsay.vocabulary.dto.VocabularyMediaImageabilityRequest
import com.playsay.vocabulary.dto.VocabularyMediaOverrideKind
import com.playsay.vocabulary.dto.VocabularyMediaOverrideRequest
import com.playsay.vocabulary.dto.VocabularyMediaReportRequest
import com.playsay.vocabulary.dto.VocabularyMediaReviewAction
import com.playsay.vocabulary.dto.VocabularyMediaReviewEventResponse
import com.playsay.vocabulary.dto.VocabularyMediaReviewRequest
import com.playsay.vocabulary.dto.VocabularyMediaSafetyState
import com.playsay.vocabulary.dto.VocabularyMediaViewResponse
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyMediaAssetEntity
import com.playsay.vocabulary.entity.VocabularyMediaGenerationRequestEntity
import com.playsay.vocabulary.entity.VocabularyMediaReportEntity
import com.playsay.vocabulary.entity.VocabularyMediaReviewEventEntity
import com.playsay.vocabulary.entity.VocabularyMediaSnapshotReferenceEntity
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyLexicalContentRevisionRepo
import com.playsay.vocabulary.repo.VocabularyLexicalSenseRepo
import com.playsay.vocabulary.repo.VocabularyMediaAssetRepo
import com.playsay.vocabulary.repo.VocabularyMediaGenerationRequestRepo
import com.playsay.vocabulary.repo.VocabularyMediaReportRepo
import com.playsay.vocabulary.repo.VocabularyMediaReviewEventRepo
import com.playsay.vocabulary.repo.VocabularyMediaSnapshotReferenceRepo
import java.security.MessageDigest
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.data.domain.PageRequest

@Service
class VocabularyMediaService(
    private val features: VocabularyFeatureProperties,
    private val entries: VocabularyEntryRepo,
    private val senses: VocabularyLexicalSenseRepo,
    private val content: VocabularyLexicalContentRevisionRepo,
    private val assets: VocabularyMediaAssetRepo,
    private val generations: VocabularyMediaGenerationRequestRepo,
    private val reviews: VocabularyMediaReviewEventRepo,
    private val reports: VocabularyMediaReportRepo,
    private val snapshotRefs: VocabularyMediaSnapshotReferenceRepo,
    private val access: VocabularyAccessService,
    private val generator: VocabularyImageGenerator,
    private val storage: VocabularyMediaObjectStorage,
    private val objectMapper: ObjectMapper,
    private val meters: MeterRegistry,
    private val rateLimiter: VocabularyMediaRateLimiter,
) {
    @Transactional
    fun view(actorSubject: String, entryId: UUID): VocabularyMediaViewResponse {
        val entry = accessibleEntry(actorSubject, entryId)
        val senseId = entry.lexicalSenseId ?: return VocabularyMediaViewResponse(entry.id, null, null, "UNRESOLVED_PRIVATE")
        val sense = senses.findById(senseId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (features.generatedMediaEnabled && sense.imageability !in setOf(LexicalImageability.NON_IMAGEABLE, LexicalImageability.SUPPRESSED)) {
            requestFirstUse(sense.id, actorSubject)
        }
        val approved = assets.findAllBySenseIdOrderByCreatedAtDesc(sense.id).filter { it.state in setOf(VocabularyMediaAssetState.APPROVED, VocabularyMediaAssetState.SUPERSEDED) }
        val selected = when (entry.mediaOverrideKind) {
            VocabularyMediaOverrideKind.HIDE.name -> null
            VocabularyMediaOverrideKind.APPROVED_ALTERNATIVE.name -> approved.firstOrNull { it.id == entry.mediaOverrideAssetId }
            else -> approved.firstOrNull { it.state == VocabularyMediaAssetState.APPROVED }
        }
        val generation = generations.findFirstBySenseIdOrderByCreatedAtDesc(sense.id)
        return VocabularyMediaViewResponse(
            entryId = entry.id,
            senseId = sense.id,
            imageability = sense.imageability,
            state = when {
                entry.mediaOverrideKind == VocabularyMediaOverrideKind.HIDE.name -> "HIDDEN"
                selected != null -> "APPROVED"
                generation?.state in setOf(VocabularyMediaGenerationState.PENDING, VocabularyMediaGenerationState.PROCESSING) -> "GENERATING"
                generation?.state == VocabularyMediaGenerationState.FAILED -> "FAILED"
                sense.imageability in setOf(LexicalImageability.NON_IMAGEABLE, LexicalImageability.SUPPRESSED) -> "TEXT_ONLY"
                else -> "NO_IMAGE"
            },
            asset = selected?.toResponse(entry.id),
            alternatives = approved.filterNot { it.id == selected?.id }.map { it.toResponse(entry.id) },
            generationPending = generation?.state in setOf(VocabularyMediaGenerationState.PENDING, VocabularyMediaGenerationState.PROCESSING),
            hidden = entry.mediaOverrideKind == VocabularyMediaOverrideKind.HIDE.name,
            failureCode = generation?.failureCode,
        )
    }

    @Transactional
    fun regenerate(actorSubject: String, entryId: UUID): VocabularyMediaViewResponse {
        val entry = accessibleEntry(actorSubject, entryId)
        val senseId = entry.lexicalSenseId ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Entry has no resolved lexical sense")
        rateLimiter.requireRegenerationAllowed(actorSubject, senseId)
        createGeneration(senseId, actorSubject, "REGENERATION", null)
        return view(actorSubject, entryId)
    }

    @Transactional
    fun override(actorSubject: String, entryId: UUID, request: VocabularyMediaOverrideRequest): VocabularyMediaViewResponse {
        val entry = accessibleEntry(actorSubject, entryId)
        when (request.kind) {
            VocabularyMediaOverrideKind.DEFAULT -> { entry.mediaOverrideKind = null; entry.mediaOverrideAssetId = null }
            VocabularyMediaOverrideKind.HIDE -> { entry.mediaOverrideKind = request.kind.name; entry.mediaOverrideAssetId = null }
            VocabularyMediaOverrideKind.APPROVED_ALTERNATIVE -> {
                val senseId = entry.lexicalSenseId ?: throw ResponseStatusException(HttpStatus.CONFLICT)
                val asset = request.assetId?.let { assets.findById(it).orElse(null) }
                    ?.takeIf { it.senseId == senseId && it.state in setOf(VocabularyMediaAssetState.APPROVED, VocabularyMediaAssetState.SUPERSEDED) }
                    ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Alternative must be an approved asset for the same sense")
                entry.mediaOverrideKind = request.kind.name
                entry.mediaOverrideAssetId = asset.id
            }
        }
        entry.updatedAt = Instant.now()
        entries.save(entry)
        return view(actorSubject, entryId)
    }

    @Transactional
    fun report(actorSubject: String, entryId: UUID, assetId: UUID, request: VocabularyMediaReportRequest): VocabularyMediaViewResponse {
        val entry = accessibleEntry(actorSubject, entryId)
        val asset = assets.findById(assetId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (asset.senseId != entry.lexicalSenseId || asset.state != VocabularyMediaAssetState.APPROVED) throw ResponseStatusException(HttpStatus.BAD_REQUEST)
        if (reports.findByEntryIdAndAssetIdAndReporterSubject(entry.id, asset.id, actorSubject) == null) {
            reports.save(VocabularyMediaReportEntity(entryId = entry.id, assetId = asset.id, reporterSubject = actorSubject, reasonCode = request.reasonCode.take(64)))
        }
        entry.mediaOverrideKind = VocabularyMediaOverrideKind.HIDE.name
        entry.mediaOverrideAssetId = null
        entries.save(entry)
        return view(actorSubject, entryId)
    }

    @Transactional(readOnly = true)
    fun candidates(actorSubject: String, reviewer: Boolean, page: Int = 0, size: Int = 50): List<VocabularyMediaAssetResponse> {
        requireReviewer(reviewer)
        return assets.findAllByStateOrderByCreatedAtAsc(
            VocabularyMediaAssetState.CANDIDATE,
            PageRequest.of(page.coerceIn(0, 10_000), size.coerceIn(1, 100)),
        ).filter { canReviewScope(actorSubject, it) }.map { it.toReviewerResponse() }
    }

    @Transactional(readOnly = true)
    fun candidate(actorSubject: String, reviewer: Boolean, assetId: UUID): VocabularyMediaAssetResponse {
        requireReviewer(reviewer)
        val asset = assets.findById(assetId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (!canReviewScope(actorSubject, asset)) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        return asset.toReviewerResponse()
    }

    @Transactional
    fun review(actorSubject: String, reviewer: Boolean, assetId: UUID, request: VocabularyMediaReviewRequest): VocabularyMediaAssetResponse {
        requireReviewer(reviewer)
        val asset = assets.findById(assetId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (!canReviewScope(actorSubject, asset)) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        if (asset.state != VocabularyMediaAssetState.CANDIDATE) throw ResponseStatusException(HttpStatus.CONFLICT)
        val now = Instant.now()
        when (request.action) {
            VocabularyMediaReviewAction.APPROVE -> {
                assets.findFirstBySenseIdAndStateOrderByApprovedAtDesc(asset.senseId, VocabularyMediaAssetState.APPROVED)?.let { previous ->
                    previous.state = VocabularyMediaAssetState.SUPERSEDED
                    previous.updatedAt = now
                    assets.save(previous)
                    asset.supersedesAssetId = previous.id
                }
                asset.state = VocabularyMediaAssetState.APPROVED
                asset.approvedBySubject = actorSubject
                asset.approvedAt = now
            }
            VocabularyMediaReviewAction.REJECT -> asset.state = VocabularyMediaAssetState.REJECTED
        }
        asset.updatedAt = now
        assets.save(asset)
        reviews.save(VocabularyMediaReviewEventEntity(assetId = asset.id, actorSubject = actorSubject, action = request.action.name, reasonCode = request.reasonCode, note = request.note))
        meters.counter("playsay.vocabulary.media.review", "action", request.action.name).increment()
        return asset.toReviewerResponse()
    }

    @Transactional
    fun imageability(actorSubject: String, reviewer: Boolean, senseId: UUID, request: VocabularyMediaImageabilityRequest) {
        requireReviewer(reviewer)
        val sense = senses.findById(senseId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        sense.imageability = request.imageability
        sense.updatedAt = Instant.now()
        senses.save(sense)
        if (request.imageability in setOf(LexicalImageability.NON_IMAGEABLE, LexicalImageability.SUPPRESSED)) {
            generations.findFirstBySenseIdOrderByCreatedAtDesc(senseId)?.takeIf { it.state in setOf(VocabularyMediaGenerationState.PENDING, VocabularyMediaGenerationState.PROCESSING) }?.let {
                it.state = VocabularyMediaGenerationState.SUPPRESSED
                it.activeFirstUseKey = null
                it.updatedAt = Instant.now()
                generations.save(it)
            }
        }
    }

    @Transactional(readOnly = true)
    fun content(actorSubject: String, entryId: UUID, assetId: UUID): VocabularyMediaObject {
        val entry = accessibleEntry(actorSubject, entryId)
        val asset = assets.findById(assetId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (asset.senseId != entry.lexicalSenseId || asset.state !in setOf(VocabularyMediaAssetState.APPROVED, VocabularyMediaAssetState.SUPERSEDED)) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        return try {
            storage.get(asset.storageKey ?: throw ResponseStatusException(HttpStatus.NOT_FOUND))
        } catch (failure: VocabularyMediaStorageException) {
            meters.counter("playsay.vocabulary.media.delivery", "outcome", "failed", "error", failure.code).increment()
            logger.warn("Vocabulary media delivery failed: assetId={}, errorCode={}", asset.id, failure.code)
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Media is temporarily unavailable")
        }
    }

    @Transactional(readOnly = true)
    fun candidateContent(actorSubject: String, reviewer: Boolean, assetId: UUID): VocabularyMediaObject {
        requireReviewer(reviewer)
        val asset = assets.findById(assetId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (!canReviewScope(actorSubject, asset)) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        return try {
            storage.get(asset.storageKey ?: throw ResponseStatusException(HttpStatus.NOT_FOUND))
        } catch (failure: VocabularyMediaStorageException) {
            meters.counter("playsay.vocabulary.media.delivery", "outcome", "failed", "error", failure.code).increment()
            logger.warn("Vocabulary media candidate delivery failed: assetId={}, errorCode={}", asset.id, failure.code)
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Media is temporarily unavailable")
        }
    }

    @Transactional
    fun pinApprovedAsset(entryId: UUID, practiceItemId: UUID) {
        if (snapshotRefs.findByPracticeItemId(practiceItemId) != null) return
        val entry = entries.findById(entryId).orElse(null) ?: return
        val senseId = entry.lexicalSenseId ?: return
        val approved = assets.findFirstBySenseIdAndStateOrderByApprovedAtDesc(senseId, VocabularyMediaAssetState.APPROVED) ?: return
        snapshotRefs.save(VocabularyMediaSnapshotReferenceEntity(practiceItemId = practiceItemId, assetId = approved.id))
    }

    @Scheduled(fixedDelayString = "\${playsay.vocabulary.media.generation-worker-ms:10000}")
    fun processPending() {
        generations.findTop50ByStateAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(VocabularyMediaGenerationState.PENDING, Instant.now())
            .forEach { request -> runCatching { processOne(request.id) }.onFailure { logger.warn("vocabulary_media_generation_failed requestId={} failure={}", request.id, it::class.simpleName) } }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun processOne(requestId: UUID) {
        val request = generations.findById(requestId).orElse(null) ?: return
        if (request.state != VocabularyMediaGenerationState.PENDING) return
        val sense = senses.findById(request.senseId).orElseThrow()
        if (sense.imageability in setOf(LexicalImageability.NON_IMAGEABLE, LexicalImageability.SUPPRESSED)) {
            request.state = VocabularyMediaGenerationState.SUPPRESSED
            request.activeFirstUseKey = null
            generations.save(request)
            return
        }
        request.state = VocabularyMediaGenerationState.PROCESSING
        request.attemptCount += 1
        generations.save(request)
        val asset = request.assetId?.let { assets.findById(it).orElse(null) } ?: return
        val prompt = promptFor(sense.id)
        try {
            val generated = generator.generate(prompt)
            if (generated.safetyState != VocabularyMediaSafetyState.SAFE) throw VocabularyImageGenerationException("SAFETY_BLOCKED")
            val key = "vocabulary-media/${sense.catalogScope.name.lowercase()}/${sense.scopeKey.sha256()}/${asset.id}.png"
            storage.put(key, generated.bytes, generated.contentType)
            asset.storageKey = key
            asset.contentType = generated.contentType
            asset.byteSize = generated.bytes.size.toLong()
            asset.width = generated.width
            asset.height = generated.height
            asset.checksumSha256 = generated.bytes.sha256()
            asset.generatorType = generated.generatorType
            asset.generatorModel = generated.model
            asset.promptTemplateVersion = prompt.templateVersion
            asset.promptFingerprint = objectMapper.writeValueAsBytes(prompt).sha256()
            asset.safetyState = generated.safetyState
            asset.altTextJson = objectMapper.writeValueAsString(generated.altText)
            asset.state = VocabularyMediaAssetState.CANDIDATE
            asset.updatedAt = Instant.now()
            assets.save(asset)
            request.state = VocabularyMediaGenerationState.COMPLETED
            request.activeFirstUseKey = null
            request.failureCode = null
            meters.counter("playsay.vocabulary.media.generation", "outcome", "candidate", "kind", request.requestKind).increment()
        } catch (failure: Exception) {
            asset.state = VocabularyMediaAssetState.FAILED
            asset.safetyState = when ((failure as? VocabularyImageGenerationException)?.failureCode) {
                "SAFETY_BLOCKED" -> VocabularyMediaSafetyState.BLOCKED
                "PROVIDER_REJECTED" -> VocabularyMediaSafetyState.PROVIDER_REJECTED
                else -> VocabularyMediaSafetyState.UNKNOWN
            }
            asset.updatedAt = Instant.now()
            assets.save(asset)
            request.failureCode = (failure as? VocabularyImageGenerationException)?.failureCode ?: (failure as? VocabularyMediaStorageException)?.code ?: "GENERATION_FAILED"
            request.state = VocabularyMediaGenerationState.FAILED
            request.activeFirstUseKey = null
            meters.counter(
                "playsay.vocabulary.media.generation",
                "outcome",
                "failed",
                "failureCode",
                request.failureCode ?: "UNKNOWN",
            ).increment()
        }
        request.updatedAt = Instant.now()
        generations.save(request)
    }

    @Scheduled(cron = "0 31 3 * * *")
    @Transactional
    fun retireUnreferencedFailures() {
        val cutoff = Instant.now().minus(30, ChronoUnit.DAYS)
        assets.findAll().filter { it.state in setOf(VocabularyMediaAssetState.FAILED, VocabularyMediaAssetState.REJECTED) && it.createdAt < cutoff && !snapshotRefs.existsByAssetId(it.id) }
            .forEach { asset ->
                asset.storageKey?.let { runCatching { storage.delete(it) } }
                asset.storageKey = null
                asset.retiredAt = Instant.now()
                asset.updatedAt = asset.retiredAt!!
                assets.save(asset)
            }
    }

    internal fun promptFor(senseId: UUID): VocabularyImagePrompt {
        val sense = senses.findById(senseId).orElseThrow()
        val revision = content.findTopBySenseIdOrderByRevisionDesc(sense.id)
        return VocabularyImagePrompt(
            sourceLanguage = sense.sourceLanguage,
            lemma = sense.normalizedLemma,
            partOfSpeech = revision?.partOfSpeech?.take(80) ?: sense.normalizedPartOfSpeech.takeIf(String::isNotBlank),
            meaning = sense.normalizedMeaning,
            translation = revision?.translation?.take(500),
            definition = revision?.definition?.take(1000),
            templateVersion = "vocabulary-image-v1",
        )
    }

    private fun requestFirstUse(senseId: UUID, actorSubject: String) {
        val key = "$senseId:vocabulary-media-v1"
        if (
            assets.findFirstBySenseIdAndStateOrderByApprovedAtDesc(senseId, VocabularyMediaAssetState.APPROVED) != null ||
            generations.findByActiveFirstUseKey(key) != null ||
            generations.findFirstBySenseIdOrderByCreatedAtDesc(senseId) != null
        ) return
        try { createGeneration(senseId, actorSubject, "FIRST_USE", key) } catch (_: DataIntegrityViolationException) { /* concurrent first use won */ }
    }

    private fun createGeneration(senseId: UUID, actorSubject: String, kind: String, activeKey: String?) {
        val sense = senses.findById(senseId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (sense.imageability in setOf(LexicalImageability.NON_IMAGEABLE, LexicalImageability.SUPPRESSED)) throw ResponseStatusException(HttpStatus.CONFLICT, "Sense is text-only")
        val asset = assets.save(VocabularyMediaAssetEntity(senseId = sense.id, catalogScope = sense.catalogScope, scopeKey = sense.scopeKey, state = VocabularyMediaAssetState.GENERATING, safetyState = VocabularyMediaSafetyState.PENDING))
        generations.save(VocabularyMediaGenerationRequestEntity(senseId = sense.id, requestKind = kind, activeFirstUseKey = activeKey, requestedBySubject = actorSubject, assetId = asset.id))
    }

    private fun accessibleEntry(actorSubject: String, entryId: UUID): VocabularyEntryEntity {
        val entry = entries.findById(entryId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        access.requireOwnerAccess(actorSubject, entry.ownerSubject, null)
        return entry
    }

    private fun VocabularyMediaAssetEntity.toResponse(entryId: UUID) = toResponse("/api/vocabulary/entries/$entryId/media/assets/$id/content")
    private fun VocabularyMediaAssetEntity.toReviewerResponse() = toResponse("/api/vocabulary/media/candidates/$id/content", reviews.findAllByAssetIdOrderByCreatedAtAsc(id))
    private fun VocabularyMediaAssetEntity.toResponse(url: String, history: List<VocabularyMediaReviewEventEntity> = emptyList()) = VocabularyMediaAssetResponse(
        id, senseId, state, url.takeIf { storageKey != null }, contentType, width, height, checksumSha256, origin, generatorType, generatorModel,
        promptTemplateVersion, safetyState, objectMapper.readValue(altTextJson, stringMapType), decorative, createdAt,
        history.map { VocabularyMediaReviewEventResponse(it.action, it.actorSubject, it.reasonCode, it.note, it.createdAt) },
    )

    private fun requireReviewer(reviewer: Boolean) { if (!reviewer) throw ResponseStatusException(HttpStatus.FORBIDDEN) }

    private fun canReviewScope(actorSubject: String, asset: VocabularyMediaAssetEntity): Boolean {
        if (asset.catalogScope != com.playsay.vocabulary.dto.LexicalCatalogScope.LEARNER) return true
        val ownerSubject = asset.scopeKey.takeIf { it.startsWith(LEARNER_SCOPE_PREFIX) }
            ?.removePrefix(LEARNER_SCOPE_PREFIX)
            ?.takeIf(String::isNotBlank)
            ?: return false
        return access.canAccessOwner(actorSubject, ownerSubject)
    }

    private companion object {
        const val LEARNER_SCOPE_PREFIX = "learner:"
        val logger = LoggerFactory.getLogger(VocabularyMediaService::class.java)
        val stringMapType = object : TypeReference<Map<String, String>>() {}
    }
}

private fun ByteArray.sha256(): String = MessageDigest.getInstance("SHA-256").digest(this).joinToString("") { "%02x".format(it) }
private fun String.sha256(): String = toByteArray().sha256()
