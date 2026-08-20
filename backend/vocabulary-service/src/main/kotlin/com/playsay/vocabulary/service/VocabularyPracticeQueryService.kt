package com.playsay.vocabulary.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyDashboardResponse
import com.playsay.vocabulary.dto.VocabularyHomeworkPreparationResponse
import com.playsay.vocabulary.dto.VocabularyHomeworkSessionRef
import com.playsay.vocabulary.dto.VocabularyLearnerSummaryResponse
import com.playsay.vocabulary.dto.VocabularyLearningEntryResponse
import com.playsay.vocabulary.dto.VocabularyPracticeItemResponse
import com.playsay.vocabulary.dto.VocabularyPracticeResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSessionSummaryResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.dto.VocabularySkillStateResponse
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.entity.VocabularyUserProjection
import com.playsay.vocabulary.mapper.toResponse
import com.playsay.vocabulary.mapper.VocabularyPracticeResponseMapper
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
import com.playsay.vocabulary.repo.VocabularyUserRepo
import com.playsay.vocabulary.util.cleanVocabularySubject
import com.playsay.vocabulary.util.hasExactVocabularyContext
import java.time.Instant
import java.util.Locale
import java.util.UUID
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyPracticeQueryService(
    private val entries: VocabularyEntryRepo,
    private val users: VocabularyUserRepo,
    private val access: VocabularyAccessService,
    private val skillStates: VocabularySkillStateRepo,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val responseMapper: VocabularyPracticeResponseMapper,
) {
    fun dashboard(
        actorSubject: String,
        ownerSubject: String?,
        lessonId: UUID?,
        query: String?,
    ): VocabularyDashboardResponse {
        val owner = access.requireOwnerAccess(actorSubject, cleanVocabularySubject(ownerSubject) ?: actorSubject, lessonId)
        val activeEntries = entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(owner, EntryStatus.ACTIVE)
        val statesByEntry = ensureStates(activeEntries).groupBy(VocabularySkillStateEntity::entryId)
        return dashboardResponse(owner, activeEntries, statesByEntry, query)
    }

    fun learners(actorSubject: String, query: String?): List<VocabularyLearnerSummaryResponse> {
        val normalizedQuery = query?.trim()?.lowercase(Locale.ROOT).orEmpty()
        val manageable = access.manageableLearners(actorSubject)
            .filter { learner ->
                normalizedQuery.isEmpty() ||
                    responseMapper.displayLabel(learner).lowercase(Locale.ROOT).contains(normalizedQuery) ||
                    learner.username?.lowercase(Locale.ROOT)?.contains(normalizedQuery) == true
            }
        if (manageable.isEmpty()) return emptyList()
        val ownerEntries = entries.findAllByOwnerSubjectInAndStatus(
            manageable.map { it.keycloakSubject },
            EntryStatus.ACTIVE,
        )
        val statesByEntry = skillStates.findAllByEntryIdIn(ownerEntries.map { it.id })
            .groupBy(VocabularySkillStateEntity::entryId)
        val entriesByOwner = ownerEntries.groupBy(VocabularyEntryEntity::ownerSubject)
        return manageable.map { learner ->
            val dashboard = dashboardResponse(
                learner.keycloakSubject,
                entriesByOwner[learner.keycloakSubject].orEmpty(),
                statesByEntry,
                null,
            )
            VocabularyLearnerSummaryResponse(
                ownerSubject = dashboard.ownerSubject,
                ownerName = dashboard.ownerName ?: responseMapper.displayLabel(learner),
                ownerUsername = learner.username,
                totalCount = dashboard.totalCount,
                dueCount = dashboard.dueCount,
                learningCount = dashboard.learningCount,
                masteredCount = dashboard.masteredCount,
                needsTranslationCount = dashboard.needsTranslationCount,
                difficultCount = dashboard.difficultCount,
                lastPracticedAt = dashboard.lastPracticedAt,
            )
        }
    }

    fun activeForLesson(actorSubject: String, lessonId: UUID): VocabularyPracticeResponse? {
        val practice = practices.findFirstByLessonIdAndStatusInOrderByUpdatedAtDesc(lessonId, queryActivePracticeStatuses)
            ?: return null
        requirePracticeAccess(actorSubject, practice)
        return responseForActor(actorSubject, practice, practiceResponse(practice))
    }

    fun requirePracticeSubscription(actorSubject: String, practiceId: UUID): VocabularyPracticeResponse {
        val practice = practices.findById(practiceId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        requirePracticeAccess(actorSubject, practice)
        return responseForActor(actorSubject, practice, practiceResponse(practice))
    }

    fun session(actorSubject: String, sessionId: UUID): VocabularyPracticeSessionSummaryResponse {
        val session = sessionEntity(sessionId)
        requireSessionAccess(actorSubject, session)
        return sessionResponse(session)
    }

    fun history(
        actorSubject: String,
        ownerSubject: String?,
        lessonId: UUID?,
        page: Int,
        size: Int,
    ): List<VocabularyPracticeSessionSummaryResponse> {
        val owner = access.requireOwnerAccess(actorSubject, cleanVocabularySubject(ownerSubject) ?: actorSubject, lessonId)
        val pageSessions = sessions.findAllByOwnerSubjectOrderByUpdatedAtDesc(
            owner,
            PageRequest.of(page.coerceAtLeast(0), size.coerceIn(1, 50)),
        )
        val sessionItems = items.findAllBySessionIdInOrderBySessionIdAscPositionAsc(pageSessions.map { it.id })
            .groupBy(VocabularyPracticeItemEntity::sessionId)
        val practiceById = practices.findAllById(pageSessions.map { it.practiceId })
            .associateBy(VocabularyPracticeEntity::id)
        val ownerName = users.findByKeycloakSubject(owner)?.let(responseMapper::displayLabel)
        return pageSessions.map { session ->
            sessionResponse(
                session = session,
                prefetchedItems = sessionItems[session.id].orEmpty(),
                prefetchedOwnerName = ownerName,
                prefetchedPractice = practiceById[session.practiceId],
            )
        }
    }

    fun legacyPractice(actorSubject: String, limit: Int) =
        entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(actorSubject, EntryStatus.ACTIVE).let { ownerEntries ->
            selectEntries(
                ownerEntries,
                ensureStates(ownerEntries).groupBy(VocabularySkillStateEntity::entryId),
                VocabularyPracticeSettingsRequest(wordLimit = limit.coerceIn(1, 100)),
            ).map { it.toResponse() }
        }

    fun ensureStates(ownerEntries: List<VocabularyEntryEntity>): List<VocabularySkillStateEntity> {
        if (ownerEntries.isEmpty()) return emptyList()
        val existing = skillStates.findAllByEntryIdIn(ownerEntries.map(VocabularyEntryEntity::id))
        val existingKeys = existing.mapTo(mutableSetOf()) { it.entryId to it.skill }
        val now = Instant.now()
        val missing = ownerEntries.flatMap { entry ->
            VocabularySkill.entries.mapNotNull { skill ->
                if ((entry.id to skill) in existingKeys) {
                    null
                } else {
                    VocabularySkillStateEntity(
                        id = UUID.randomUUID(),
                        entryId = entry.id,
                        ownerSubject = entry.ownerSubject,
                        skill = skill,
                        stage = LearningStage.NEW,
                        intervalIndex = 0,
                        dueAt = now,
                        createdAt = now,
                        updatedAt = now,
                    )
                }
            }
        }
        return existing + skillStates.saveAll(missing)
    }

    fun selectEntries(
        ownerEntries: List<VocabularyEntryEntity>,
        statesByEntry: Map<UUID, List<VocabularySkillStateEntity>>,
        request: VocabularyPracticeSettingsRequest,
    ): List<VocabularyEntryEntity> {
        val eligible = ownerEntries.filter { entry ->
            entry.status == EntryStatus.ACTIVE && !entry.practicePaused && !entry.translation.isNullOrBlank()
        }
        val byId = eligible.associateBy(VocabularyEntryEntity::id)
        return selectPracticeEntryIds(
            candidates = eligible.map { entry ->
                VocabularySelectionCandidate(
                    id = entry.id,
                    dueAt = entryDueAt(entry, statesByEntry[entry.id].orEmpty()),
                    stage = aggregateVocabularyStage(statesByEntry[entry.id].orEmpty()),
                    updatedAt = entry.updatedAt,
                )
            },
            wordLimit = request.wordLimit,
            pinnedEntryIds = request.pinnedEntryIds,
            excludedEntryIds = request.excludedEntryIds,
            now = Instant.now(),
        ).mapNotNull(byId::get)
    }

    fun practiceResponse(practice: VocabularyPracticeEntity): VocabularyPracticeResponse =
        responseMapper.practice(
            practice,
            sessions.findAllByPracticeIdOrderByCreatedAtAsc(practice.id).map(::sessionResponse),
        )

    fun homeworkPreparationResponse(practice: VocabularyPracticeEntity): VocabularyHomeworkPreparationResponse =
        responseMapper.homework(practice, sessions.findAllByPracticeIdOrderByCreatedAtAsc(practice.id))

    fun sessionResponse(
        session: VocabularyPracticeSessionEntity,
        prefetchedItems: List<VocabularyPracticeItemEntity>? = null,
        prefetchedOwnerName: String? = null,
        prefetchedPractice: VocabularyPracticeEntity? = null,
    ): VocabularyPracticeSessionSummaryResponse {
        val sessionItems = prefetchedItems ?: items.findAllBySessionIdOrderByPositionAsc(session.id)
        val practice = prefetchedPractice ?: practices.findById(session.practiceId).orElse(null)
        val ownerName = prefetchedOwnerName ?: users.findByKeycloakSubject(session.ownerSubject)
            ?.let(responseMapper::displayLabel)
        return responseMapper.session(
            entity = session,
            sessionItems = sessionItems,
            ownerName = ownerName,
            practice = practice,
            currentItem = if (session.status in queryTerminalSessionStatuses) null else currentItem(session, sessionItems),
        )
    }

    fun currentItem(
        session: VocabularyPracticeSessionEntity,
        sessionItems: List<VocabularyPracticeItemEntity>,
    ): VocabularyPracticeItemEntity? {
        val pending = sessionItems.filter { it.completedAt == null }
        if (pending.isEmpty()) return null
        val eligible = pending.filter { it.retryAfterSequence <= session.attemptSequence }
        return eligible.firstOrNull { it.position >= session.currentItemPosition } ?: eligible.firstOrNull()
    }

    fun responseForActor(
        actorSubject: String,
        practice: VocabularyPracticeEntity,
        response: VocabularyPracticeResponse,
    ): VocabularyPracticeResponse {
        return responseMapper.forActor(actorSubject, practice, response)
    }

    private fun dashboardResponse(
        owner: String,
        ownerEntries: List<VocabularyEntryEntity>,
        statesByEntry: Map<UUID, List<VocabularySkillStateEntity>>,
        query: String?,
    ): VocabularyDashboardResponse {
        val now = Instant.now()
        val normalizedQuery = query?.trim()?.lowercase(Locale.ROOT).orEmpty()
        val learningEntries = ownerEntries.asSequence()
            .filter { entry ->
                normalizedQuery.isEmpty() ||
                    entry.sourceText.lowercase(Locale.ROOT).contains(normalizedQuery) ||
                    entry.translation?.lowercase(Locale.ROOT)?.contains(normalizedQuery) == true
            }
            .map { entry ->
                val entryStates = statesByEntry[entry.id].orEmpty()
                val dueAt = entryDueAt(entry, entryStates)
                responseMapper.learningEntry(
                    entry = entry,
                    states = entryStates,
                    stage = aggregateVocabularyStage(entryStates),
                    dueAt = dueAt,
                    now = now,
                )
            }
            .toList()
        val allStages = ownerEntries.associate { entry ->
            entry.id to aggregateVocabularyStage(statesByEntry[entry.id].orEmpty())
        }
        return VocabularyDashboardResponse(
            ownerSubject = owner,
            ownerName = users.findByKeycloakSubject(owner)?.let(responseMapper::displayLabel),
            totalCount = ownerEntries.size,
            dueCount = ownerEntries.count { entry ->
                !entry.practicePaused && !entry.translation.isNullOrBlank() &&
                    !entryDueAt(entry, statesByEntry[entry.id].orEmpty()).isAfter(now)
            },
            learningCount = allStages.values.count { it in setOf(LearningStage.NEW, LearningStage.LEARNING, LearningStage.REVIEW) },
            masteredCount = allStages.values.count { it == LearningStage.MASTERED },
            needsTranslationCount = ownerEntries.count { it.translation.isNullOrBlank() },
            difficultCount = statesByEntry.values.count { entryStates ->
                entryStates.any { it.lapseCount > 0 || it.lastRating == PracticeRating.AGAIN }
            },
            lastPracticedAt = statesByEntry.values.flatten()
                .mapNotNull(VocabularySkillStateEntity::lastPracticedAt)
                .maxOrNull(),
            entries = learningEntries,
        )
    }

    private fun requireSessionAccess(actorSubject: String, session: VocabularyPracticeSessionEntity) {
        if (actorSubject == session.ownerSubject) return
        val practice = practices.findById(session.practiceId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        access.requireOwnerAccess(actorSubject, session.ownerSubject, practice.lessonId)
    }

    private fun requirePracticeAccess(actorSubject: String, practice: VocabularyPracticeEntity) {
        if (practice.createdBySubject == actorSubject) return
        val practiceSessions = sessions.findAllByPracticeIdOrderByCreatedAtAsc(practice.id)
        if (practiceSessions.any { it.ownerSubject == actorSubject }) return
        if (practiceSessions.isEmpty()) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        practiceSessions.forEach { session ->
            access.requireOwnerAccess(actorSubject, session.ownerSubject, practice.lessonId)
        }
    }

    private fun sessionEntity(sessionId: UUID): VocabularyPracticeSessionEntity =
        sessions.findById(sessionId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }

    private fun entryDueAt(entry: VocabularyEntryEntity, states: List<VocabularySkillStateEntity>): Instant {
        val required = states.filter { state ->
            state.skill in setOf(VocabularySkill.MEANING, VocabularySkill.FORM) ||
                (state.skill == VocabularySkill.CONTEXT && hasExactVocabularyContext(entry))
        }
        return required.minOfOrNull(VocabularySkillStateEntity::dueAt) ?: entry.createdAt
    }
}

private val queryTerminalSessionStatuses = setOf(SessionStatus.COMPLETED, SessionStatus.CANCELLED)
private val queryActivePracticeStatuses = setOf(PracticeStatus.PUBLISHED, PracticeStatus.ACTIVE, PracticeStatus.PAUSED)
