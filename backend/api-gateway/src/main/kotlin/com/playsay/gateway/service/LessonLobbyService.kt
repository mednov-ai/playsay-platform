package com.playsay.gateway.service

import com.playsay.gateway.dto.LessonAccessAttemptResponse
import com.playsay.gateway.dto.LessonAccessStatusResponse
import com.playsay.gateway.dto.LessonAdmissionOverviewResponse
import com.playsay.gateway.dto.LessonLobbyEntryResponse
import com.playsay.contract.registration.model.InternalUserIdentityResponse
import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.entity.LessonEntryAttemptEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.realtime.LessonRealtimeHub
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LessonLobbyService(
    private val attemptRepo: LessonEntryAttemptRepo,
    private val participantRepo: LessonParticipantRepo,
    private val lessonRepo: LessonRepo,
    private val registrationGateway: RegistrationGateway,
    private val authorizationService: ScheduledLessonAuthorizationService,
    private val admissionService: LessonAdmissionService,
    private val handoffService: LessonAssertionHandoffService,
    private val realtimeHub: LessonRealtimeHub,
    private val liveKitRemovalClient: LiveKitParticipantRemovalClient,
    private val collaborationDisconnectClient: CollaborationDisconnectClient,
    private val auditService: LessonAccessAuditService,
    private val tokenService: LessonAccessTokenService,
    private val clock: Clock,
) {
    @Transactional
    fun requestLobby(
        lessonId: UUID,
        attemptId: UUID,
        attemptSecret: String,
        displayLabel: String,
    ): LessonAccessStatusResponse {
        val now = Instant.now(clock)
        val attempt = requireAttempt(lessonId, attemptId, attemptSecret, now)
        attempt.lobbyLabel = displayLabel.trim().replace(whitespace, " ").take(120)
        attempt.state = "LOBBY_PENDING"
        attempt.updatedAt = now
        attemptRepo.save(attempt)
        auditService.record(lessonId, LessonAccessAuditEvent.LOBBY_REQUESTED, LessonAccessAuditOutcome.ACCEPTED, LessonAccessActorKind.ANONYMOUS)
        realtimeHub.publishLobbyChanged(lessonId)
        return LessonAccessStatusResponse("WAITING_FOR_TEACHER")
    }

    @Transactional(readOnly = true)
    fun overview(authentication: JwtAuthenticationToken, lessonId: UUID): LessonAdmissionOverviewResponse {
        requireManager(authentication, lessonId)
        val now = Instant.now(clock)
        val pending = attemptRepo.findByLessonIdAndStateOrderByCreatedAtAsc(lessonId, "LOBBY_PENDING")
            .filter { attempt -> now.isBefore(attempt.expiresAt) }
            .map { attempt ->
                LessonLobbyEntryResponse(
                    attemptId = attempt.id,
                    displayLabel = attempt.lobbyLabel.orEmpty(),
                    createdAt = attempt.createdAt,
                    expiresAt = attempt.expiresAt,
                )
            }
        return LessonAdmissionOverviewResponse(lessonId, pending, admissionService.list(lessonId))
    }

    @Transactional
    fun approve(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        attemptId: UUID,
        studentSubject: String,
        expectedRevision: Long?,
    ): LessonAccessStatusResponse {
        requireManager(authentication, lessonId)
        lessonRepo.lockById(lessonId) ?: throw invalidDecision()
        val identity = runCatching { registrationGateway.findExactUser(studentSubject) }.getOrNull()
        val rostered = participantRepo.existsByLessonIdAndSubject(lessonId, studentSubject)
        if (!LessonLobbyMappingPolicy.canMap(identity, studentSubject, rostered)) throw invalidDecision()
        val now = Instant.now(clock)
        val attempt = attemptRepo.lockById(attemptId)
        if (attempt == null || attempt.lessonId != lessonId || attempt.state != "LOBBY_PENDING" || !now.isBefore(attempt.expiresAt)) {
            throw invalidDecision()
        }
        admissionService.approveLobby(lessonId, studentSubject, authentication.token.subject, expectedRevision)
        attempt.targetSubject = studentSubject
        attempt.confirmationMethod = "LOBBY"
        attempt.state = "LOBBY_APPROVED"
        attempt.updatedAt = now
        attemptRepo.save(attempt)
        auditService.record(lessonId, LessonAccessAuditEvent.LOBBY_APPROVED, LessonAccessAuditOutcome.ACCEPTED, authentication.auditActorKind())
        realtimeHub.publishLobbyChanged(lessonId)
        return LessonAccessStatusResponse("APPROVED")
    }

    @Transactional
    fun deny(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        attemptId: UUID,
    ): LessonAccessStatusResponse {
        requireManager(authentication, lessonId)
        lessonRepo.lockById(lessonId) ?: throw invalidDecision()
        val attempt = attemptRepo.lockById(attemptId)
        if (attempt == null || attempt.lessonId != lessonId || attempt.state != "LOBBY_PENDING") throw invalidDecision()
        attempt.state = "LOBBY_DENIED"
        attempt.updatedAt = Instant.now(clock)
        attemptRepo.save(attempt)
        auditService.record(lessonId, LessonAccessAuditEvent.LOBBY_DENIED, LessonAccessAuditOutcome.ACCEPTED, authentication.auditActorKind())
        realtimeHub.publishLobbyChanged(lessonId)
        return LessonAccessStatusResponse("DENIED")
    }

    @Transactional
    fun kick(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        subject: String,
        expectedRevision: Long?,
    ): LessonAccessStatusResponse {
        requireManager(authentication, lessonId)
        lessonRepo.lockById(lessonId) ?: throw invalidDecision()
        if (!participantRepo.existsByLessonIdAndSubject(lessonId, subject)) throw invalidDecision()
        admissionService.applyTeacherAction(
            lessonId,
            subject,
            LessonAdmissionEvent.KICK,
            authentication.token.subject,
            expectedRevision,
        )
        realtimeHub.revokeLessonSubject(lessonId, subject)
        val roomName = lessonRepo.findById(lessonId).orElse(null)?.livekitRoomName
        val (mediaRemoved, collaborationDisconnected) = disconnectWithinDeadline(roomName, lessonId, subject)
        auditService.record(
            lessonId,
            LessonAccessAuditEvent.STUDENT_KICKED,
            if (mediaRemoved && collaborationDisconnected) LessonAccessAuditOutcome.ACCEPTED else LessonAccessAuditOutcome.PARTIAL,
            authentication.auditActorKind(),
        )
        return LessonAccessStatusResponse(
            if (mediaRemoved && collaborationDisconnected) "KICKED" else "KICKED_PARTIAL_CLEANUP",
        )
    }

    @Transactional
    fun readmit(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        subject: String,
        expectedRevision: Long?,
    ): LessonAccessStatusResponse {
        requireManager(authentication, lessonId)
        lessonRepo.lockById(lessonId) ?: throw invalidDecision()
        if (!participantRepo.existsByLessonIdAndSubject(lessonId, subject)) throw invalidDecision()
        admissionService.applyTeacherAction(
            lessonId,
            subject,
            LessonAdmissionEvent.READMIT,
            authentication.token.subject,
            expectedRevision,
        )
        auditService.record(lessonId, LessonAccessAuditEvent.STUDENT_READMITTED, LessonAccessAuditOutcome.ACCEPTED, authentication.auditActorKind())
        return LessonAccessStatusResponse("ADMITTED")
    }

    @Transactional
    fun status(
        lessonId: UUID,
        attemptId: UUID,
        attemptSecret: String,
    ): LessonAccessAttemptResponse {
        val now = Instant.now(clock)
        val attempt = requireAttempt(lessonId, attemptId, attemptSecret, now)
        return when (attempt.state) {
            "LOBBY_PENDING" -> response(attempt, "WAITING_FOR_TEACHER")
            "PENDING_REENTRY" -> {
                val subject = attempt.targetSubject
                val admission = subject?.let { admissionService.find(lessonId, it) }
                if (admission?.status == LessonAdmissionStatus.ADMITTED.name) {
                    attempt.state = "IDENTITY_CONFIRMED"
                    attempt.updatedAt = now
                    attemptRepo.save(attempt)
                    handoffService.issue(attempt)
                } else {
                    response(attempt, "WAITING_FOR_TEACHER")
                }
            }
            "LOBBY_DENIED" -> response(attempt, "DENIED")
            "LOBBY_APPROVED", "IDENTITY_CONFIRMED" -> handoffService.issue(attempt)
            "ASSERTION_ISSUED" -> response(attempt, "AUTHORIZATION_ALREADY_ISSUED")
            else -> response(attempt, "CONFIRMATION_REQUIRED")
        }
    }

    @Transactional
    fun remembered(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        attemptId: UUID,
        attemptSecret: String,
    ): LessonAccessAttemptResponse {
        val now = Instant.now(clock)
        val attempt = requireAttempt(lessonId, attemptId, attemptSecret, now)
        val subject = authentication.token.subject
        val lesson = lessonRepo.findScheduleRowById(lessonId) ?: throw invalidDecision()
        val assigned = (lesson.teacherSubject == subject && authentication.authorities.any { it.authority == MetaData.Authorities.TEACHER }) ||
            (participantRepo.existsByLessonIdAndSubject(lessonId, subject) &&
                authentication.authorities.any { it.authority == MetaData.Authorities.STUDENT })
        if (!assigned) throw invalidDecision()
        attempt.targetSubject = subject
        attempt.confirmationMethod = "REMEMBERED_SESSION"
        attempt.rememberMe = true
        attempt.state = "IDENTITY_CONFIRMED"
        attempt.updatedAt = now
        attemptRepo.save(attempt)
        val admission = admissionService.confirmIdentity(lessonId, subject, "REMEMBERED_SESSION")
        if (admission.status == LessonAdmissionStatus.KICKED.name) {
            attempt.state = "PENDING_REENTRY"
            attemptRepo.save(attempt)
            return response(attempt, "WAITING_FOR_TEACHER")
        }
        return LessonAccessAttemptResponse(
            attempt.id,
            status = "AUTHENTICATED_READY",
            lessonId = lessonId,
            authorizationUrl = "/lessons/$lessonId/classroom",
        )
    }

    private fun requireAttempt(lessonId: UUID, attemptId: UUID, secret: String, now: Instant): LessonEntryAttemptEntity {
        val attempt = attemptRepo.lockById(attemptId)
        if (attempt == null || attempt.lessonId != lessonId || !now.isBefore(attempt.expiresAt) ||
            !tokenService.matchesHash(secret, attempt.browserSecretHash)
        ) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.LESSON_ATTEMPT_INVALID)
        }
        return attempt
    }

    private fun requireManager(authentication: JwtAuthenticationToken, lessonId: UUID) {
        if (!authorizationService.canManageLesson(authentication, lessonId)) throw invalidDecision()
    }

    private fun invalidDecision() = ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.LESSON_LOBBY_UNAVAILABLE)

    private fun response(attempt: LessonEntryAttemptEntity, status: String) =
        LessonAccessAttemptResponse(attempt.id, status = status, lessonId = attempt.lessonId)

    private fun disconnectWithinDeadline(roomName: String?, lessonId: UUID, subject: String): Pair<Boolean, Boolean> {
        val executor = Executors.newVirtualThreadPerTaskExecutor()
        return try {
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
            val media = executor.submit<Boolean> { roomName == null || liveKitRemovalClient.remove(roomName, subject) }
            val collaboration = executor.submit<Boolean> { collaborationDisconnectClient.disconnect(lessonId, subject) }
            fun result(future: java.util.concurrent.Future<Boolean>): Boolean = runCatching {
                val remaining = (deadline - System.nanoTime()).coerceAtLeast(1)
                future.get(remaining, TimeUnit.NANOSECONDS)
            }.getOrElse {
                future.cancel(true)
                false
            }
            result(media) to result(collaboration)
        } finally {
            executor.shutdownNow()
        }
    }

    private companion object {
        val whitespace = Regex("\\s+")
    }
}

private fun JwtAuthenticationToken.auditActorKind(): LessonAccessActorKind =
    if (authorities.any { it.authority == MetaData.Authorities.ADMIN }) LessonAccessActorKind.ADMIN else LessonAccessActorKind.TEACHER

internal object LessonLobbyMappingPolicy {
    fun canMap(identity: InternalUserIdentityResponse?, requestedSubject: String, rostered: Boolean): Boolean =
        rostered && identity?.subject == requestedSubject && identity.enabled &&
            MetaData.Roles.STUDENT in identity.roles &&
            identity.roles.none { role -> role in forbiddenStaffRoles }

    private val forbiddenStaffRoles = setOf(MetaData.Roles.TEACHER, MetaData.Roles.ADMIN)
}
