package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyPracticeResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import org.springframework.stereotype.Service

@Service
class VocabularySelfPracticeService(
    private val entries: VocabularyEntryRepo,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val queryService: VocabularyPracticeQueryService,
    private val creationService: VocabularyPracticeCreationService,
) {
    fun selfPractice(actorSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticeResponse {
        val activeSession = sessions.findFirstByOwnerSubjectAndStatusInOrderByUpdatedAtDesc(
            actorSubject,
            setOf(SessionStatus.NOT_STARTED, SessionStatus.IN_PROGRESS, SessionStatus.PAUSED),
        )
        if (request.planId == null) {
            activeSession?.let { session -> reusablePractice(actorSubject, session.id, session.practiceId, request)?.let { return it } }
        }
        return creationService.create(
            actorSubject,
            request.copy(
                ownerSubjects = listOf(actorSubject),
                delivery = PracticeDelivery.SELF,
                lessonId = null,
                assignmentId = null,
            ),
            PracticeDelivery.SELF,
        )
    }

    private fun reusablePractice(
        actorSubject: String,
        sessionId: java.util.UUID,
        practiceId: java.util.UUID,
        request: VocabularyPracticeSettingsRequest,
    ): VocabularyPracticeResponse? {
        val practice = practices.findById(practiceId).orElse(null) ?: return null
        if (practice.status in setOf(PracticeStatus.CANCELLED, PracticeStatus.FAILED)) return null
        if (practice.delivery == PracticeDelivery.SELF) return actorResponse(actorSubject, practice)
        if (practice.delivery != PracticeDelivery.HOMEWORK) return null
        val ownerEntries = entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(actorSubject, EntryStatus.ACTIVE)
        val statesByEntry = queryService.ensureStates(ownerEntries).groupBy(VocabularySkillStateEntity::entryId)
        val todayEntryIds = queryService.selectEntries(ownerEntries, statesByEntry, request)
            .mapTo(mutableSetOf(), VocabularyEntryEntity::id)
        val homeworkEntryIds = items.findAllBySessionIdOrderByPositionAsc(sessionId)
            .mapNotNullTo(mutableSetOf(), VocabularyPracticeItemEntity::entryId)
        return practice.takeIf { todayEntryIds.isNotEmpty() && homeworkEntryIds.containsAll(todayEntryIds) }
            ?.let { actorResponse(actorSubject, it) }
    }

    private fun actorResponse(actorSubject: String, practice: VocabularyPracticeEntity): VocabularyPracticeResponse =
        queryService.responseForActor(actorSubject, practice, queryService.practiceResponse(practice))
}
