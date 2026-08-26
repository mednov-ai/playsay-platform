package com.playsay.gateway.service

import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service

@Service
class LessonRememberedSessionService(
    private val registrationGateway: RegistrationGateway,
    private val auditService: LessonAccessAuditService,
) {
    fun revokeCurrent(authentication: JwtAuthenticationToken) {
        val sessionId = authentication.token.getClaimAsString("sid")
            ?.takeIf(String::isNotBlank)
            ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.LESSON_SESSION_INVALID)
        registrationGateway.revokeLessonSession(authentication.token.subject, sessionId)
        auditService.record(null, LessonAccessAuditEvent.SESSION_REVOKED, LessonAccessAuditOutcome.ACCEPTED, LessonAccessActorKind.STUDENT)
    }

    fun revokeAll(authentication: JwtAuthenticationToken) {
        registrationGateway.revokeAllLessonSessions(authentication.token.subject)
        auditService.record(null, LessonAccessAuditEvent.SESSION_REVOKED, LessonAccessAuditOutcome.ACCEPTED, LessonAccessActorKind.STUDENT)
    }
}
