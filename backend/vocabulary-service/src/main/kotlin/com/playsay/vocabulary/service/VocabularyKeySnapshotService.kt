package com.playsay.vocabulary.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.VocabularyKeyCompletionContextResponse
import com.playsay.vocabulary.dto.VocabularyKeyNgramSettingsRequest
import com.playsay.vocabulary.dto.VocabularyKeyReturnContextResponse
import com.playsay.vocabulary.dto.VocabularyKeySourceOffsetResponse
import com.playsay.vocabulary.dto.VocabularyKeyTargetResponse
import com.playsay.vocabulary.entity.VocabularyKeySnapshotEntity
import com.playsay.vocabulary.entity.VocabularyKeyTargetEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.repo.VocabularyKeySnapshotRepo
import com.playsay.vocabulary.repo.VocabularyKeyTargetRepo
import java.time.Instant
import java.time.Duration
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

data class VocabularyKeySnapshotView(
    val entity: VocabularyKeySnapshotEntity,
    val settings: VocabularyKeyNgramSettingsRequest,
    val targets: List<VocabularyKeyTargetResponse>,
    val completionContext: VocabularyKeyCompletionContextResponse,
    val returnContext: VocabularyKeyReturnContextResponse,
)

@Service
class VocabularyKeySnapshotService(
    private val snapshots: VocabularyKeySnapshotRepo,
    private val targets: VocabularyKeyTargetRepo,
    private val materializer: VocabularyKeyMaterializer,
    private val weakPatterns: VocabularyKeyboardWeakPatternClient,
    private val objectMapper: ObjectMapper,
) {
    @Transactional
    fun getOrCreate(
        session: VocabularyPracticeSessionEntity,
        practice: VocabularyPracticeEntity,
        sessionItems: List<VocabularyPracticeItemEntity>,
        sourceText: (VocabularyPracticeItemEntity) -> String?,
    ): VocabularyKeySnapshotView {
        snapshots.findBySessionId(session.id)?.let { existing ->
            if (existing.expiresAt.isBefore(Instant.now())) throw ResponseStatusException(HttpStatus.GONE, "Vocabulary Key snapshot expired.")
            return view(existing)
        }
        val settings = runCatching {
            objectMapper.readValue<VocabularyKeyNgramSettingsRequest>(practice.keyNgramSettingsJson)
        }.getOrDefault(VocabularyKeyNgramSettingsRequest())
        val sources = sessionItems.mapNotNull { item ->
            val entryId = item.entryId ?: return@mapNotNull null
            sourceText(item)?.takeIf(String::isNotBlank)?.let { text -> VocabularyKeySource(entryId, item.id, text) }
        }
        val materialized = materializer.materialize(
            sources = sources,
            mode = practice.keyMode,
            settings = settings,
            seed = practice.keyMaterializerSeed,
            version = practice.keyMaterializerVersion,
            weakPatterns = weakPatterns.patterns(session.ownerSubject),
        )
        val completionContext = VocabularyKeyCompletionContextResponse(
            delivery = practice.delivery,
            completionPolicy = practice.completionPolicy,
            completionPolicyVersion = practice.completionPolicyVersion,
            assignmentId = practice.assignmentId,
            lessonId = practice.lessonId,
            lastAcknowledgedPosition = session.currentItemPosition,
        )
        val returnContext = allowlistedReturnContext(practice)
        val now = Instant.now()
        val snapshot = snapshots.save(
            VocabularyKeySnapshotEntity(
                id = UUID.randomUUID(),
                sessionId = session.id,
                ownerSubject = session.ownerSubject,
                mode = practice.keyMode,
                layout = "EN",
                ngramSettingsJson = objectMapper.writeValueAsString(settings),
                materializerVersion = practice.keyMaterializerVersion,
                materializerSeed = practice.keyMaterializerSeed,
                completionContextJson = objectMapper.writeValueAsString(completionContext),
                returnContextJson = objectMapper.writeValueAsString(returnContext),
                expiresAt = now.plus(SNAPSHOT_TTL),
                createdAt = now,
            ),
        )
        targets.saveAll(materialized.targets.map { target ->
            VocabularyKeyTargetEntity(
                id = target.id,
                snapshotId = snapshot.id,
                position = target.position,
                targetType = target.type,
                text = target.text,
                sourceEntryIdsJson = objectMapper.writeValueAsString(target.sourceEntryIds),
                sourceItemIdsJson = objectMapper.writeValueAsString(target.sourceItemIds),
                offsetsJson = objectMapper.writeValueAsString(target.offsets),
                createdAt = now,
            )
        })
        return view(snapshot)
    }

    private fun view(snapshot: VocabularyKeySnapshotEntity): VocabularyKeySnapshotView = VocabularyKeySnapshotView(
        entity = snapshot,
        settings = objectMapper.readValue(snapshot.ngramSettingsJson),
        targets = targets.findAllBySnapshotIdOrderByPositionAsc(snapshot.id).map { target ->
            VocabularyKeyTargetResponse(
                targetId = target.id,
                position = target.position,
                type = target.targetType,
                text = target.text,
                sourceEntryIds = objectMapper.readValue(target.sourceEntryIdsJson, uuidListType),
                sourceItemIds = objectMapper.readValue(target.sourceItemIdsJson, uuidListType),
                offsets = objectMapper.readValue(target.offsetsJson, offsetListType),
            )
        },
        completionContext = objectMapper.readValue(snapshot.completionContextJson),
        returnContext = objectMapper.readValue(snapshot.returnContextJson),
    )

    private fun allowlistedReturnContext(practice: VocabularyPracticeEntity): VocabularyKeyReturnContextResponse = when (practice.delivery) {
        PracticeDelivery.HOMEWORK -> VocabularyKeyReturnContextResponse("HONEY_SCHOOL_HOMEWORK", "/")
        PracticeDelivery.LIVE -> VocabularyKeyReturnContextResponse("HONEY_SCHOOL_LESSON", "/")
        PracticeDelivery.SELF -> VocabularyKeyReturnContextResponse("HONEY_SCHOOL_VOCABULARY", "/")
    }

    private companion object {
        val uuidListType = object : TypeReference<List<UUID>>() {}
        val offsetListType = object : TypeReference<List<VocabularyKeySourceOffsetResponse>>() {}
        val SNAPSHOT_TTL: Duration = Duration.ofDays(180)
    }
}
