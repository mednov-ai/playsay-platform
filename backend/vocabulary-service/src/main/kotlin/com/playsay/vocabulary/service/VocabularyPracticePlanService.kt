package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.dto.VocabularyPracticeEntryPreviewResponse
import com.playsay.vocabulary.dto.VocabularyPracticeExerciseDistributionResponse
import com.playsay.vocabulary.dto.VocabularyPracticeItemPreviewResponse
import com.playsay.vocabulary.dto.VocabularyPracticeOwnerPreviewResponse
import com.playsay.vocabulary.dto.VocabularyPracticePreviewResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.dto.VocabularySelectionExclusionResponse
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyPracticePlanEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.mapper.toResponse
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticePlanRepo
import com.playsay.vocabulary.repo.VocabularyOccurrenceRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
import com.playsay.vocabulary.repo.VocabularyUserRepo
import com.playsay.vocabulary.util.hasExactVocabularyContext
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.math.ceil
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyPracticePlanService(
    private val entries: VocabularyEntryRepo,
    private val users: VocabularyUserRepo,
    private val access: VocabularyAccessService,
    private val skillStates: VocabularySkillStateRepo,
    private val plans: VocabularyPracticePlanRepo,
    private val occurrences: VocabularyOccurrenceRepo,
    private val planner: VocabularyPracticePlanner,
    private val objectMapper: ObjectMapper,
    private val recipeService: VocabularySelectionRecipeService,
    private val meters: MeterRegistry,
) {
    @Transactional
    fun preview(actorSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticePreviewResponse {
        val now = Instant.now()
        val effectiveRequest = recipeService.resolveSettings(actorSubject, request)
        if (effectiveRequest.planId == null && !effectiveRequest.materializationKey.isNullOrBlank()) {
            plans.findByCreatedBySubjectAndMaterializationKey(actorSubject, effectiveRequest.materializationKey.trim())?.let { stored ->
                return previewResponse(
                    stored.id,
                    stored.revision,
                    stored.expiresAt,
                    objectMapper.readValue(stored.payloadJson, VocabularyPracticePlanPayload::class.java),
                    stored,
                )
            }
        }
        val owners = resolveOwners(actorSubject, effectiveRequest)
        val planId = effectiveRequest.planId ?: UUID.randomUUID()
        val existing = effectiveRequest.planId?.let {
            plans.lockByIdAndCreatedBySubject(it, actorSubject)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary practice plan was not found.")
        }
        if (existing != null && existing.expiresAt.isBefore(now)) {
            throw ResponseStatusException(HttpStatus.GONE, "Vocabulary practice plan has expired. Refresh the preview.")
        }
        if (existing?.publishedPracticeId != null) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Published vocabulary practice plans cannot be edited.")
        }
        if (existing != null && effectiveRequest.planRevision != null && effectiveRequest.planRevision != existing.revision) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice plan has changed. Refresh the preview.")
        }
        val revision = (existing?.revision ?: 0) + 1
        val plannedOwners = owners.map { owner ->
            val ownerEntries = entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(owner, EntryStatus.ACTIVE)
            val statesByEntry = ensureStates(ownerEntries).groupBy(VocabularySkillStateEntity::entryId)
            val recentLessonEntryIds = effectiveRequest.lessonId?.takeIf { ownerEntries.isNotEmpty() }?.let { lessonId ->
                occurrences.findEntryIdsByLessonId(ownerEntries.map { it.id }, lessonId).toSet()
            }.orEmpty()
            val ownerPlan = planner.planOwner(owner, ownerEntries, statesByEntry, effectiveRequest, planId, now, recentLessonEntryIds)
            val user = users.findByKeycloakSubject(owner)
            VocabularyPracticePlanOwnerPayload(
                ownerSubject = owner,
                ownerName = user?.displayLabel(),
                ownerUsername = user?.username,
                selected = ownerPlan.selected,
                items = ownerPlan.items,
                exclusions = ownerPlan.exclusions,
                categoryCounts = ownerPlan.categoryCounts,
            )
        }
        val expiresAt = now.plus(24, ChronoUnit.HOURS)
        val payload = VocabularyPracticePlanPayload(
            request = effectiveRequest.copy(planId = null, planRevision = null),
            owners = plannedOwners,
        )
        plans.save(
            existing?.apply {
                this.revision = revision
                this.delivery = effectiveRequest.delivery
                this.mode = effectiveRequest.mode
                this.lessonId = effectiveRequest.lessonId
                this.payloadJson = objectMapper.writeValueAsString(payload)
                this.expiresAt = expiresAt
                this.recipeId = effectiveRequest.recipeId
                this.selectionReasonsJson = objectMapper.writeValueAsString(plannedOwners.associate { owner -> owner.ownerSubject to owner.selected.associate { it.entryId to it.reason } })
                this.exclusionsJson = objectMapper.writeValueAsString(plannedOwners.flatMap { it.exclusions.entries }.associate { it.key to it.value })
                this.eligibilityWatermark = now
                this.materializationSeed = planId.mostSignificantBits xor planId.leastSignificantBits
                this.policyVersionsJson = "{\"planner\":\"content-aware-v1\",\"evaluator\":\"deterministic-v2\"}"
                this.contentRevisionIdsJson = contentRevisionIdsJson(plannedOwners)
                this.materializationKey = effectiveRequest.materializationKey?.trim()?.takeIf(String::isNotEmpty)
                this.updatedAt = now
            } ?: VocabularyPracticePlanEntity(
                id = planId,
                createdBySubject = actorSubject,
                revision = revision,
                delivery = effectiveRequest.delivery,
                mode = effectiveRequest.mode,
                lessonId = effectiveRequest.lessonId,
                payloadJson = objectMapper.writeValueAsString(payload),
                expiresAt = expiresAt,
                publishedPracticeId = null,
                recipeId = effectiveRequest.recipeId,
                selectionReasonsJson = objectMapper.writeValueAsString(plannedOwners.associate { owner -> owner.ownerSubject to owner.selected.associate { it.entryId to it.reason } }),
                exclusionsJson = objectMapper.writeValueAsString(plannedOwners.flatMap { it.exclusions.entries }.associate { it.key to it.value }),
                eligibilityWatermark = now,
                materializationSeed = planId.mostSignificantBits xor planId.leastSignificantBits,
                policyVersionsJson = "{\"planner\":\"content-aware-v1\",\"evaluator\":\"deterministic-v2\"}",
                contentRevisionIdsJson = contentRevisionIdsJson(plannedOwners),
                materializationKey = effectiveRequest.materializationKey?.trim()?.takeIf(String::isNotEmpty),
                createdAt = existing?.createdAt ?: now,
                updatedAt = now,
            ),
        )
        meters.counter(
            "playsay.vocabulary.plan.created",
            "delivery",
            effectiveRequest.delivery.name,
            "mode",
            effectiveRequest.mode.name,
        ).increment()
        meters.summary("playsay.vocabulary.plan.owner_count").record(plannedOwners.size.toDouble())
        meters.summary("playsay.vocabulary.plan.item_count").record(plannedOwners.sumOf { it.items.size }.toDouble())
        return previewResponse(planId, revision, expiresAt, payload, plans.findById(planId).orElseThrow())
    }

    @Transactional
    fun requireForPublication(
        actorSubject: String,
        planId: UUID,
        revision: Long?,
    ): ResolvedVocabularyPracticePlan {
        val entity = plans.lockByIdAndCreatedBySubject(planId, actorSubject)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary practice plan was not found.")
        if (entity.expiresAt.isBefore(Instant.now())) {
            throw ResponseStatusException(HttpStatus.GONE, "Vocabulary practice plan has expired. Refresh the preview.")
        }
        if (revision != null && revision != entity.revision) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice plan has changed. Refresh the preview.")
        }
        val payload = objectMapper.readValue(entity.payloadJson, VocabularyPracticePlanPayload::class.java)
        payload.owners.forEach { owner ->
            access.requireOwnerAccess(actorSubject, owner.ownerSubject, entity.lessonId)
        }
        return ResolvedVocabularyPracticePlan(entity, payload)
    }

    @Transactional
    fun markPublished(planId: UUID, practiceId: UUID) {
        val entity = plans.findById(planId).orElseThrow()
        entity.publishedPracticeId = practiceId
        entity.updatedAt = Instant.now()
        plans.save(entity)
    }

    @Scheduled(fixedDelayString = "\${playsay.practice.plan-cleanup-ms:3600000}")
    @Transactional
    fun deleteExpiredDrafts() {
        plans.deleteByExpiresAtBeforeAndPublishedPracticeIdIsNull(Instant.now())
    }

    private fun resolveOwners(actorSubject: String, request: VocabularyPracticeSettingsRequest): List<String> {
        val requested = request.ownerSubjects.map(String::trim).filter(String::isNotBlank).distinct()
        val owners = if (requested.isEmpty()) listOf(actorSubject) else requested
        owners.forEach { owner -> access.requireOwnerAccess(actorSubject, owner, request.lessonId) }
        return owners
    }

    private fun ensureStates(ownerEntries: List<com.playsay.vocabulary.entity.VocabularyEntryEntity>): List<VocabularySkillStateEntity> {
        if (ownerEntries.isEmpty()) return emptyList()
        val existing = skillStates.findAllByEntryIdIn(ownerEntries.map { it.id })
        val entriesById = ownerEntries.associateBy { it.id }
        existing.filter { state ->
            val entry = entriesById[state.entryId] ?: return@filter false
            val available = state.skill != VocabularySkill.CONTEXT || hasExactVocabularyContext(entry)
            if (available == state.skillAvailable) false else {
                state.skillAvailable = available
                true
            }
        }.takeIf(List<VocabularySkillStateEntity>::isNotEmpty)?.let(skillStates::saveAll)
        val existingKeys = existing.mapTo(mutableSetOf()) { it.entryId to it.skill }
        val now = Instant.now()
        val missing = ownerEntries.flatMap { entry ->
            VocabularySkill.entries.mapNotNull { skill ->
                if (entry.id to skill in existingKeys) null else VocabularySkillStateEntity(
                    id = UUID.randomUUID(),
                    entryId = entry.id,
                    ownerSubject = entry.ownerSubject,
                    skill = skill,
                    dueAt = entry.createdAt,
                    skillAvailable = skill != VocabularySkill.CONTEXT || hasExactVocabularyContext(entry),
                    createdAt = now,
                    updatedAt = now,
                )
            }
        }
        return existing + skillStates.saveAll(missing)
    }

    private fun previewResponse(
        planId: UUID,
        revision: Long,
        expiresAt: Instant,
        payload: VocabularyPracticePlanPayload,
        entity: VocabularyPracticePlanEntity,
    ): VocabularyPracticePreviewResponse {
        val ownerResponses = payload.owners.map { owner ->
            val selectedEntries = entries.findAllById(owner.selected.map(PlannedEntrySelection::entryId))
                .associateBy { it.id }
            val selections = owner.selected.mapNotNull { selected ->
                selectedEntries[selected.entryId]?.let { entry ->
                    VocabularyPracticeEntryPreviewResponse(entry.toResponse(), selected.reason, selected.warnings)
                }
            }
            VocabularyPracticeOwnerPreviewResponse(
                ownerSubject = owner.ownerSubject,
                ownerName = owner.ownerName,
                ownerUsername = owner.ownerUsername,
                selectedCount = selections.size,
                estimatedItemCount = owner.items.size,
                dueCount = selections.count { it.reason.name in setOf("OVERDUE", "DUE_TODAY", "PINNED") },
                newCount = selections.count { it.reason.name == "NEW" },
                needsTranslationCount = entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(owner.ownerSubject, EntryStatus.ACTIVE)
                    .count { it.translation.isNullOrBlank() },
                entries = selections.map(VocabularyPracticeEntryPreviewResponse::entry),
                selection = selections,
                exerciseDistribution = owner.items.groupingBy(PlannedPracticeItem::type).eachCount()
                    .map { (type, count) -> VocabularyPracticeExerciseDistributionResponse(type, count) },
                sampleItems = owner.items.take(3).map {
                    VocabularyPracticeItemPreviewResponse(it.entryId, it.type, it.prompt)
                },
            )
        }
        // Students work through personal sessions in parallel. Group duration is
        // therefore the longest personal queue, not the sum of every queue.
        val itemCount = ownerResponses.maxOfOrNull(VocabularyPracticeOwnerPreviewResponse::estimatedItemCount) ?: 0
        return VocabularyPracticePreviewResponse(
            planId = planId,
            revision = revision,
            expiresAt = expiresAt,
            mode = payload.request.mode,
            delivery = payload.request.delivery,
            estimatedMinutes = ceil(itemCount / 2.2).toInt().coerceAtLeast(if (itemCount == 0) 0 else 1),
            owners = ownerResponses,
            eligibilityWatermark = entity.eligibilityWatermark,
            materializationSeed = entity.materializationSeed,
            categoryCounts = payload.owners.flatMap { it.categoryCounts.entries }
                .groupingBy { it.key }.fold(0) { total, item -> total + item.value },
            exclusions = payload.owners.flatMap { owner ->
                owner.exclusions.map { (entryId, reason) -> VocabularySelectionExclusionResponse(entryId, reason) }
            },
        )
    }

    private fun contentRevisionIdsJson(owners: List<VocabularyPracticePlanOwnerPayload>): String {
        val entryIds = owners.flatMap { owner -> owner.selected.map(PlannedEntrySelection::entryId) }
        return objectMapper.writeValueAsString(entries.findAllById(entryIds).mapNotNull { it.lexicalContentRevisionId }.distinct())
    }

    private fun com.playsay.vocabulary.entity.VocabularyUserProjection.displayLabel(): String =
        displayName?.trim()?.takeIf(String::isNotEmpty)
            ?: username?.trim()?.takeIf(String::isNotEmpty)
            ?: keycloakSubject
}

data class VocabularyPracticePlanPayload(
    val request: VocabularyPracticeSettingsRequest = VocabularyPracticeSettingsRequest(),
    val owners: List<VocabularyPracticePlanOwnerPayload> = emptyList(),
)

data class VocabularyPracticePlanOwnerPayload(
    val ownerSubject: String = "",
    val ownerName: String? = null,
    val ownerUsername: String? = null,
    val selected: List<PlannedEntrySelection> = emptyList(),
    val items: List<PlannedPracticeItem> = emptyList(),
    val exclusions: Map<UUID, String> = emptyMap(),
    val categoryCounts: Map<String, Int> = emptyMap(),
)

data class ResolvedVocabularyPracticePlan(
    val entity: VocabularyPracticePlanEntity,
    val payload: VocabularyPracticePlanPayload,
)
