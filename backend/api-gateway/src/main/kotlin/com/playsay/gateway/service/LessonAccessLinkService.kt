package com.playsay.gateway.service

import com.playsay.gateway.dto.LessonAccessAttemptResponse
import com.playsay.gateway.dto.LessonAccessLinkResponse
import com.playsay.gateway.entity.LessonAccessLinkEntity
import com.playsay.gateway.entity.LessonEntryAttemptEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.repo.LessonAccessLinkRepo
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import java.net.URI
import java.security.SecureRandom
import java.time.Clock
import java.time.Instant
import java.util.Base64
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Suppress("LongParameterList")
class LessonAccessLinkService(
    private val linkRepo: LessonAccessLinkRepo,
    private val attemptRepo: LessonEntryAttemptRepo,
    private val lessonRepo: LessonRepo,
    private val authorizationService: ScheduledLessonAuthorizationService,
    private val tokenService: LessonAccessTokenService,
    private val auditService: LessonAccessAuditService,
    @param:Value("\${playsay.public-app-url}") private val publicAppUrl: String,
    @param:Value("\${playsay.lesson-access.enabled:false}") private val enabled: Boolean,
    @param:Value("\${playsay.lesson-access.attempt-ttl-seconds:900}") private val attemptTtlSeconds: Long,
    private val clock: Clock = Clock.systemUTC(),
    private val secureRandom: SecureRandom = SecureRandom(),
) {
    @Transactional
    fun getOrCreate(authentication: JwtAuthenticationToken, lessonId: UUID): LessonAccessLinkResponse {
        requireEnabled()
        requireManager(authentication, lessonId)
        lessonRepo.lockById(lessonId) ?: throw notFound()
        val now = Instant.now(clock)
        val existing = linkRepo.lockActiveByLessonId(lessonId)
        val created = existing == null || existing.keyVersion != tokenService.keyVersion
        val active = if (created) {
            existing?.also {
                it.revokedAt = now
                it.rotatedAt = now
                linkRepo.save(it)
            }
            createLink(lessonId, authentication.token.subject, now)
        } else {
            requireNotNull(existing)
        }
        if (created) auditService.record(lessonId, LessonAccessAuditEvent.LINK_CREATED, LessonAccessAuditOutcome.ACCEPTED, authentication.actorKind())
        return active.toResponse()
    }

    @Transactional
    fun rotate(authentication: JwtAuthenticationToken, lessonId: UUID): LessonAccessLinkResponse {
        requireEnabled()
        requireManager(authentication, lessonId)
        lessonRepo.lockById(lessonId) ?: throw notFound()
        val now = Instant.now(clock)
        linkRepo.lockActiveByLessonId(lessonId)?.also {
            it.revokedAt = now
            it.rotatedAt = now
            linkRepo.save(it)
        }
        return createLink(lessonId, authentication.token.subject, now).also {
            auditService.record(lessonId, LessonAccessAuditEvent.LINK_ROTATED, LessonAccessAuditOutcome.ACCEPTED, authentication.actorKind())
        }.toResponse()
    }

    @Transactional
    fun revoke(authentication: JwtAuthenticationToken, lessonId: UUID) {
        requireEnabled()
        requireManager(authentication, lessonId)
        lessonRepo.lockById(lessonId) ?: throw notFound()
        val now = Instant.now(clock)
        linkRepo.lockActiveByLessonId(lessonId)?.also {
            it.revokedAt = now
            linkRepo.save(it)
        }
        auditService.record(lessonId, LessonAccessAuditEvent.LINK_REVOKED, LessonAccessAuditOutcome.ACCEPTED, authentication.actorKind())
    }

    @Transactional
    fun start(lessonId: UUID, token: String, requestOrigin: String): LessonAccessAttemptResponse {
        requireEnabled()
        requireSameOrigin(requestOrigin)
        val now = Instant.now(clock)
        val lesson = lessonRepo.findById(lessonId).orElse(null) ?: throw invalidLink()
        if (lesson.status in closedStatuses || lesson.scheduledEnd?.isBefore(lessonAccessEndsAfter(now)) != false) {
            throw ProjectResponseException.localized(HttpStatus.GONE, MetaData.ErrorCodes.LESSON_ACCESS_CLOSED)
        }
        val link = linkRepo.findFirstByLessonIdAndRevokedAtIsNullOrderByRevisionDesc(lessonId) ?: throw invalidLink()
        if (!tokenService.matches(token, lessonId, link.revision, link.keyVersion) ||
            !tokenService.matchesHash(token, link.tokenHash)
        ) {
            throw invalidLink()
        }

        val browserSecret = randomSecret()
        val expiry = minOf(now.plusSeconds(attemptTtlSeconds), lesson.scheduledEnd!!.plusSeconds(LESSON_ACCESS_GRACE_SECONDS))
        val attempt = attemptRepo.save(
            LessonEntryAttemptEntity(
                lessonId = lessonId,
                linkRevision = link.revision,
                browserSecretHash = tokenService.hash(browserSecret),
                state = "STARTED",
                expiresAt = expiry,
                createdAt = now,
                updatedAt = now,
            ),
        )
        auditService.record(lessonId, LessonAccessAuditEvent.LINK_STARTED, LessonAccessAuditOutcome.ACCEPTED, LessonAccessActorKind.ANONYMOUS)
        val opensAt = lesson.scheduledStart?.minusSeconds(LESSON_ACCESS_GRACE_SECONDS)
        val waiting = opensAt?.isAfter(now) == true
        return LessonAccessAttemptResponse(
            attemptId = attempt.id,
            attemptSecret = browserSecret,
            status = if (waiting) "WAITING_FOR_WINDOW" else "CONFIRMATION_REQUIRED",
            lessonId = lessonId,
            opensAt = opensAt.takeIf { waiting },
            retryAfterSeconds = opensAt?.epochSecond?.minus(now.epochSecond)?.coerceAtLeast(1)?.takeIf { waiting },
        )
    }

    private fun createLink(lessonId: UUID, actorSubject: String, now: Instant): LessonAccessLinkEntity {
        val revision = (linkRepo.findFirstByLessonIdOrderByRevisionDesc(lessonId)?.revision ?: 0) + 1
        val token = tokenService.derive(lessonId, revision)
        return linkRepo.save(
            LessonAccessLinkEntity(
                lessonId = lessonId,
                tokenHash = tokenService.hash(token),
                revision = revision,
                keyVersion = tokenService.keyVersion,
                origin = normalizedPublicOrigin(),
                createdBySubject = actorSubject,
                createdAt = now,
            ),
        )
    }

    private fun LessonAccessLinkEntity.toResponse(): LessonAccessLinkResponse {
        val token = tokenService.derive(lessonId, revision, keyVersion)
        return LessonAccessLinkResponse(
            lessonId = lessonId,
            url = "${publicAppUrl.trimEnd('/')}/lesson-access/$lessonId#token=$token",
            revision = revision,
            createdAt = createdAt,
            revokedAt = revokedAt,
        )
    }

    private fun requireManager(authentication: JwtAuthenticationToken, lessonId: UUID) {
        if (!authorizationService.canManageLesson(authentication, lessonId)) throw notFound()
    }

    private fun requireSameOrigin(requestOrigin: String) {
        val normalized = try {
            val uri = URI(requestOrigin)
            "${uri.scheme}://${uri.authority}"
        } catch (_: IllegalArgumentException) {
            ""
        }
        if (normalized != normalizedPublicOrigin()) throw invalidLink()
    }

    private fun normalizedPublicOrigin(): String {
        val uri = URI(publicAppUrl)
        return "${uri.scheme}://${uri.authority}"
    }

    private fun randomSecret(): String = ByteArray(32)
        .also(secureRandom::nextBytes)
        .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

    private fun requireEnabled() {
        if (!enabled) throw notFound()
    }

    private fun notFound() = ProjectResponseException.localized(
        HttpStatus.NOT_FOUND,
        MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND,
    )

    private fun invalidLink() = ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.LESSON_ACCESS_INVALID)

    private companion object {
        val closedStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
    }
}

private fun JwtAuthenticationToken.actorKind(): LessonAccessActorKind = when {
    authorities.any { it.authority == MetaData.Authorities.ADMIN } -> LessonAccessActorKind.ADMIN
    authorities.any { it.authority == MetaData.Authorities.TEACHER } -> LessonAccessActorKind.TEACHER
    else -> LessonAccessActorKind.STUDENT
}
