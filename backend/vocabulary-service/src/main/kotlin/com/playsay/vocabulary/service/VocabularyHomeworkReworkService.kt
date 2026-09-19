package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.repo.VocabularyKeyResultRepo
import java.util.UUID
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyHomeworkCompletionPolicy
import com.playsay.vocabulary.dto.VocabularyHomeworkReworkRequest
import com.playsay.vocabulary.dto.VocabularyHomeworkReworkResponse
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.repo.VocabularyPracticeAttemptRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import java.time.Instant
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyHomeworkReworkService(
    private val access: VocabularyAccessService,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
    private val keyResults: VocabularyKeyResultRepo,
    private val objectMapper: ObjectMapper,
) {
    @Transactional
    fun rework(request: VocabularyHomeworkReworkRequest): VocabularyHomeworkReworkResponse {
        val source = sessions.lockById(request.sourceSessionId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val practice = practices.findById(source.practiceId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (source.ownerSubject != request.ownerSubject || practice.assignmentId != request.assignmentId ||
            practice.delivery != PracticeDelivery.HOMEWORK || practice.completionPolicy != VocabularyHomeworkCompletionPolicy.TEACHER_REVIEW
        ) throw ResponseStatusException(HttpStatus.NOT_FOUND)
        access.requireOwnerAccess(request.actorSubject, source.ownerSubject, practice.lessonId)
        sessions.findByReworkSourceSessionId(source.id)?.let { return VocabularyHomeworkReworkResponse(it.id) }
        if (source.status != SessionStatus.COMPLETED) throw ResponseStatusException(HttpStatus.CONFLICT)
        val frozen = items.findAllBySessionIdOrderByPositionAsc(source.id)
        val mistakes = attempts.findAllBySessionIdOrderByCreatedAtAsc(source.id).filter { !it.correct }.map { it.itemId }.toMutableSet()
        keyResults.findAllBySessionIdOrderByPositionAsc(source.id).filter { it.errors > 0 }.forEach {
            mistakes.addAll(objectMapper.readValue(it.sourceItemIdsJson, Array<UUID>::class.java))
        }
        val selected = frozen.filter { it.id in mistakes }.ifEmpty { frozen }
        if (selected.isEmpty()) throw ResponseStatusException(HttpStatus.CONFLICT)
        val now = Instant.now()
        val child = sessions.save(
            VocabularyPracticeSessionEntity(
                practiceId = practice.id, ownerSubject = source.ownerSubject,
                createdAt = now, updatedAt = now,
            ).apply { reworkSourceSessionId = source.id },
        )
        items.saveAll(selected.mapIndexed { position, item -> cloneItem(item, child, position, now) })
        practice.status = PracticeStatus.PUBLISHED
        practice.completedAt = null
        practice.updatedAt = now
        practices.save(practice)
        return VocabularyHomeworkReworkResponse(child.id)
    }

    private fun cloneItem(
        source: VocabularyPracticeItemEntity,
        session: VocabularyPracticeSessionEntity,
        position: Int,
        now: Instant,
    ) = VocabularyPracticeItemEntity(
        sessionId = session.id, entryId = source.entryId, position = position,
        skill = source.skill, exerciseType = source.exerciseType, prompt = source.prompt, answer = source.answer,
        optionsJson = source.optionsJson, schemaVersion = source.schemaVersion,
        acceptedAnswersJson = source.acceptedAnswersJson, contentJson = source.contentJson,
        affectsSchedule = source.affectsSchedule, lexicalContentRevisionId = source.lexicalContentRevisionId,
        snapshotJson = source.snapshotJson, createdAt = now, updatedAt = now,
    )
}
