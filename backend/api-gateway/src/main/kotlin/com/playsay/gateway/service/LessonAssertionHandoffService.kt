package com.playsay.gateway.service

import com.playsay.gateway.dto.LessonAccessAttemptResponse
import com.playsay.gateway.dto.LessonAuthAssertionRequest
import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.entity.LessonEntryAttemptEntity
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Instant
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LessonAssertionHandoffService(
    private val attemptRepo: LessonEntryAttemptRepo,
    private val lessonRepo: LessonRepo,
    private val participantRepo: LessonParticipantRepo,
    private val admissionService: LessonAdmissionService,
    private val registrationGateway: RegistrationGateway,
    private val auditService: LessonAccessAuditService,
    private val clock: Clock,
    @param:Value("\${playsay.public-app-url}") private val publicAppUrl: String,
    @param:Value("\${playsay.lesson-access.oidc-client-id:playsay-web}") private val clientId: String,
    @param:Value("\${playsay.lesson-access.environment-issuer:}") private val issuer: String,
    @param:Value("\${playsay.lesson-access.oidc-callback:\${playsay.public-app-url}/auth/callback}") private val callback: String,
) {
    @Transactional
    fun issue(attempt: LessonEntryAttemptEntity): LessonAccessAttemptResponse {
        val now = Instant.now(clock)
        val subject = attempt.targetSubject ?: return response(attempt, "CONFIRMATION_REQUIRED")
        val lesson = lessonRepo.findById(attempt.lessonId).orElse(null) ?: return response(attempt, "CLOSED")
        if (!isAssigned(attempt.lessonId, subject) || lesson.status in closedStatuses) return response(attempt, "CLOSED")
        val admission = admissionService.find(attempt.lessonId, subject)
        if (admission?.status == LessonAdmissionStatus.KICKED.name) return response(attempt, "WAITING_FOR_TEACHER")
        if (admission?.status != LessonAdmissionStatus.ADMITTED.name) return response(attempt, "WAITING_FOR_TEACHER")
        if (!isLessonInsideAccessWindow(lesson.status, lesson.scheduledStart, lesson.scheduledEnd, now, closedStatuses)) {
            return LessonAccessAttemptResponse(
                attempt.id,
                status = "WAITING_FOR_WINDOW",
                lessonId = attempt.lessonId,
                opensAt = lesson.scheduledStart?.minusSeconds(LESSON_ACCESS_GRACE_SECONDS),
            )
        }
        if (attempt.assertionIssuedAt != null) return response(attempt, "AUTHORIZATION_ALREADY_ISSUED")
        val assertion = registrationGateway.createLessonAuthAssertion(
            LessonAuthAssertionRequest(subject, attempt.id, clientId, issuer, callback, attempt.rememberMe),
        )
        attempt.assertionIssuedAt = now
        attempt.state = "ASSERTION_ISSUED"
        attempt.updatedAt = now
        attemptRepo.save(attempt)
        auditService.record(attempt.lessonId, LessonAccessAuditEvent.ASSERTION_ISSUED, LessonAccessAuditOutcome.ACCEPTED, LessonAccessActorKind.SYSTEM)
        return LessonAccessAttemptResponse(
            attempt.id,
            status = "AUTHORIZATION_READY",
            lessonId = attempt.lessonId,
            authorizationUrl = "${publicAppUrl.trimEnd('/')}/lesson-access/${attempt.lessonId}/auth#assertion=${assertion.handle}",
        )
    }

    private fun isAssigned(lessonId: java.util.UUID, subject: String): Boolean {
        val lesson = lessonRepo.findScheduleRowById(lessonId) ?: return false
        val identity = runCatching { registrationGateway.findExactUser(subject) }.getOrNull() ?: return false
        return (lesson.teacherSubject == subject && MetaData.Roles.TEACHER in identity.roles) ||
            (MetaData.Roles.STUDENT in identity.roles && participantRepo.existsByLessonIdAndSubject(lessonId, subject))
    }

    private fun response(attempt: LessonEntryAttemptEntity, status: String) =
        LessonAccessAttemptResponse(attempt.id, status = status, lessonId = attempt.lessonId)

    private companion object {
        val closedStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
    }
}
