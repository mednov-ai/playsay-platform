package com.playsay.gateway.service

import com.playsay.gateway.dto.LessonAccessAttemptResponse
import com.playsay.gateway.dto.LessonAccessStatusResponse
import com.playsay.gateway.client.LessonReminderEmailClient
import com.playsay.gateway.client.LessonReminderEmailCommand
import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.entity.LessonEmailChallengeEntity
import com.playsay.gateway.entity.LessonEntryAttemptEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.repo.LessonEmailChallengeRepo
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import java.security.SecureRandom
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LessonEmailChallengeService(
    private val attemptRepo: LessonEntryAttemptRepo,
    private val challengeRepo: LessonEmailChallengeRepo,
    private val lessonRepo: LessonRepo,
    private val participantRepo: LessonParticipantRepo,
    private val registrationGateway: RegistrationGateway,
    private val emailClient: LessonReminderEmailClient,
    private val tokenService: LessonAccessTokenService,
    private val admissionService: LessonAdmissionService,
    private val handoffService: LessonAssertionHandoffService,
    private val auditService: LessonAccessAuditService,
    private val rateLimitService: LessonChallengeRateLimitService,
    private val clock: Clock,
    private val random: SecureRandom = SecureRandom(),
) {
    @Transactional
    fun requestCode(
        lessonId: UUID,
        attemptId: UUID,
        attemptSecret: String,
        email: String,
        locale: String?,
        clientAddress: String,
    ): LessonAccessStatusResponse {
        val now = Instant.now(clock)
        val attempt = requireAttempt(lessonId, attemptId, attemptSecret, now)
        val normalizedEmail = email.trim().lowercase()
        val emailDigest = tokenService.protect("lesson-entry-email", normalizedEmail)
        if (!rateLimitService.allow(lessonId, attemptId, emailDigest, clientAddress)) {
            auditService.record(lessonId, LessonAccessAuditEvent.CHALLENGE_REQUESTED, LessonAccessAuditOutcome.REJECTED, LessonAccessActorKind.ANONYMOUS)
            return genericCodeSent()
        }
        val latest = challengeRepo.findFirstByAttemptIdAndConsumedAtIsNullOrderByCreatedAtDesc(attempt.id)
        if (!LessonEmailCodePolicy.canResend(latest?.createdAt, now)) return genericCodeSent()

        val identity = runCatching { registrationGateway.resolveLessonIdentity(normalizedEmail) }.getOrNull()
        val subject = identity?.takeIf { candidate ->
            val lesson = lessonRepo.findScheduleRowById(lessonId)
            (lesson?.teacherSubject == candidate.subject && MetaData.Roles.TEACHER in candidate.roles) ||
                (MetaData.Roles.STUDENT in candidate.roles && participantRepo.existsByLessonIdAndSubject(lessonId, candidate.subject))
        }?.subject
        val challengeId = UUID.randomUUID()
        val code = newCode()
        val challenge = challengeRepo.save(
            LessonEmailChallengeEntity(
                id = challengeId,
                attemptId = attempt.id,
                emailDigest = emailDigest,
                codeHash = tokenService.protect("lesson-entry-code:$challengeId", code),
                targetSubject = subject,
                expiresAt = now.plus(LessonEmailCodePolicy.TTL),
                createdAt = now,
            ),
        )
        attempt.attemptCount += 1
        attempt.updatedAt = now
        attemptRepo.save(attempt)

        if (subject != null) {
            runCatching {
                emailClient.send(
                    LessonReminderEmailCommand(
                        to = normalizedEmail,
                        templateKey = "lesson-entry-code",
                        locale = locale,
                        idempotencyKey = "lesson-entry:${challenge.id}",
                        model = mapOf(
                            "code" to code,
                            "expiresMinutes" to LessonEmailCodePolicy.TTL.toMinutes().toString(),
                            "lessonTime" to lessonRepo.findById(lessonId).orElse(null)?.scheduledStart?.toString(),
                        ),
                        replayUntil = challenge.expiresAt,
                    ),
                )
            }
        }
        auditService.record(lessonId, LessonAccessAuditEvent.CHALLENGE_REQUESTED, LessonAccessAuditOutcome.ACCEPTED, LessonAccessActorKind.ANONYMOUS)
        return genericCodeSent()
    }

    @Transactional
    fun verifyCode(
        lessonId: UUID,
        attemptId: UUID,
        attemptSecret: String,
        code: String,
        rememberMe: Boolean,
    ): LessonAccessAttemptResponse {
        val now = Instant.now(clock)
        val attempt = requireAttempt(lessonId, attemptId, attemptSecret, now)
        val latest = challengeRepo.findFirstByAttemptIdAndConsumedAtIsNullOrderByCreatedAtDesc(attempt.id)
            ?: throw invalidCode()
        val challenge = challengeRepo.lockById(latest.id) ?: throw invalidCode()
        if (!LessonEmailCodePolicy.canVerify(challenge.consumedAt, challenge.expiresAt, challenge.attemptCount, now)) {
            throw invalidCode()
        }
        challenge.attemptCount += 1
        val valid = LessonEmailCodePolicy.validFormat(code) && challenge.targetSubject != null &&
            tokenService.matchesProtected("lesson-entry-code:${challenge.id}", code.trim(), challenge.codeHash)
        if (!valid) {
            if (challenge.attemptCount >= LessonEmailCodePolicy.MAX_ATTEMPTS) challenge.consumedAt = now
            challengeRepo.save(challenge)
            throw invalidCode()
        }
        val subject = challenge.targetSubject!!.takeIf { isAssigned(lessonId, it) } ?: throw invalidCode()
        challenge.consumedAt = now
        challengeRepo.save(challenge)
        attempt.targetSubject = subject
        attempt.confirmationMethod = "EMAIL"
        attempt.rememberMe = rememberMe
        attempt.state = "IDENTITY_CONFIRMED"
        attempt.updatedAt = now
        attemptRepo.save(attempt)

        val admission = admissionService.confirmIdentity(lessonId, subject, "EMAIL")
        auditService.record(lessonId, LessonAccessAuditEvent.CHALLENGE_VERIFIED, LessonAccessAuditOutcome.ACCEPTED, LessonAccessActorKind.ANONYMOUS)
        if (admission.status == LessonAdmissionStatus.KICKED.name) {
            attempt.state = "PENDING_REENTRY"
            attempt.updatedAt = now
            attemptRepo.save(attempt)
            return LessonAccessAttemptResponse(attempt.id, status = "WAITING_FOR_TEACHER", lessonId = lessonId)
        }

        return handoffService.issue(attempt)
    }

    private fun requireAttempt(
        lessonId: UUID,
        attemptId: UUID,
        secret: String,
        now: Instant,
    ): LessonEntryAttemptEntity {
        val attempt = attemptRepo.lockById(attemptId)
        if (attempt == null || attempt.lessonId != lessonId || !now.isBefore(attempt.expiresAt) ||
            !tokenService.matchesHash(secret, attempt.browserSecretHash)
        ) {
            throw invalidAttempt()
        }
        return attempt
    }

    private fun isAssigned(lessonId: UUID, subject: String): Boolean {
        val lesson = lessonRepo.findScheduleRowById(lessonId) ?: return false
        val identity = runCatching { registrationGateway.findExactUser(subject) }.getOrNull() ?: return false
        return (lesson.teacherSubject == subject && MetaData.Roles.TEACHER in identity.roles) ||
            (MetaData.Roles.STUDENT in identity.roles && participantRepo.existsByLessonIdAndSubject(lessonId, subject))
    }

    private fun newCode(): String = random.nextInt(1_000_000).toString().padStart(6, '0')

    private fun genericCodeSent() = LessonAccessStatusResponse("CODE_SENT_IF_ELIGIBLE")

    private fun invalidAttempt() = ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.LESSON_ATTEMPT_INVALID)
    private fun invalidCode() = ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.LESSON_CODE_INVALID)

}
