package com.playsay.gateway.service

import com.playsay.gateway.dto.LessonAdmissionResponse
import com.playsay.gateway.entity.LessonAdmissionEntity
import com.playsay.gateway.repo.LessonAdmissionRepo
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.annotation.Propagation

@Service
class LessonAdmissionService(
    private val repo: LessonAdmissionRepo,
    private val clock: Clock,
) {
    @Transactional
    fun confirmIdentity(lessonId: UUID, subject: String, method: String): LessonAdmissionEntity {
        val now = Instant.now(clock)
        val existing = repo.lockByLessonIdAndSubject(lessonId, subject)
        val current = existing?.status?.let(LessonAdmissionStatus::valueOf)
        val next = LessonAdmissionStateMachine.transition(current, LessonAdmissionEvent.CONFIRM_IDENTITY)
        val admission = existing ?: LessonAdmissionEntity(
            lessonId = lessonId,
            subject = subject,
            createdAt = now,
        )
        admission.status = next.name
        admission.admissionMethod = method
        admission.revision = if (existing == null) 1 else existing.revision + 1
        admission.updatedAt = now
        return repo.saveAndFlush(admission)
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun applyTeacherAction(
        lessonId: UUID,
        subject: String,
        event: LessonAdmissionEvent,
        actorSubject: String,
        expectedRevision: Long? = null,
    ): LessonAdmissionEntity {
        val now = Instant.now(clock)
        val existing = repo.lockByLessonIdAndSubject(lessonId, subject)
        if (expectedRevision != null && existing?.revision != expectedRevision) {
            throw StaleLessonAdmissionRevision()
        }
        val current = existing?.status?.let(LessonAdmissionStatus::valueOf)
        val next = LessonAdmissionStateMachine.transition(current, event)
        val admission = existing ?: LessonAdmissionEntity(
            lessonId = lessonId,
            subject = subject,
            createdAt = now,
        )
        admission.status = next.name
        admission.admissionMethod = if (event == LessonAdmissionEvent.APPROVE) "LOBBY" else admission.admissionMethod
        admission.approvingActorSubject = actorSubject
        admission.revision = if (existing == null) 1 else existing.revision + 1
        admission.updatedAt = now
        return repo.saveAndFlush(admission)
    }

    @Transactional
    fun approveLobby(
        lessonId: UUID,
        subject: String,
        actorSubject: String,
        expectedRevision: Long?,
    ): LessonAdmissionEntity {
        val now = Instant.now(clock)
        val existing = repo.lockByLessonIdAndSubject(lessonId, subject)
        if (expectedRevision != null && existing?.revision != expectedRevision) throw StaleLessonAdmissionRevision()
        val next = if (existing == null) {
            LessonAdmissionStatus.ADMITTED
        } else {
            LessonAdmissionStateMachine.transition(
                LessonAdmissionStatus.valueOf(existing.status),
                LessonAdmissionEvent.APPROVE,
            )
        }
        val admission = existing ?: LessonAdmissionEntity(lessonId = lessonId, subject = subject, createdAt = now)
        admission.status = next.name
        admission.admissionMethod = "LOBBY"
        admission.approvingActorSubject = actorSubject
        admission.revision = if (existing == null) 1 else existing.revision + 1
        admission.updatedAt = now
        return repo.saveAndFlush(admission)
    }

    @Transactional(readOnly = true)
    fun find(lessonId: UUID, subject: String): LessonAdmissionEntity? = repo.findByLessonIdAndSubject(lessonId, subject)

    @Transactional(readOnly = true)
    fun list(lessonId: UUID): List<LessonAdmissionResponse> = repo.findByLessonIdOrderByCreatedAtAsc(lessonId).map { entity ->
        LessonAdmissionResponse(
            subject = entity.subject,
            status = entity.status,
            revision = entity.revision,
            admissionMethod = entity.admissionMethod,
            updatedAt = entity.updatedAt,
        )
    }
}

class StaleLessonAdmissionRevision : IllegalStateException("Lesson admission revision is stale")
