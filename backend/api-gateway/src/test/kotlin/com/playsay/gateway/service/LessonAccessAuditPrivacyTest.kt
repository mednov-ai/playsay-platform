package com.playsay.gateway.service

import com.playsay.gateway.entity.LessonAccessAuditEntity
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertEquals

class LessonAccessAuditPrivacyTest {
    @Test
    fun `audit persistence cannot store tokens codes email labels or subjects`() {
        val persistedFields = LessonAccessAuditEntity::class.java.declaredFields.map { it.name }.toSet()

        assertTrue(setOf("lessonId", "eventCode", "outcome", "actorKind", "createdAt").all(persistedFields::contains))
        val prohibitedFields = setOf("token", "tokenHash", "code", "codeHash", "email", "emailDigest", "label", "subject", "sessionId")
        assertFalse(persistedFields.any(prohibitedFields::contains))
    }

    @Test
    fun `audit vocabulary covers every security-sensitive lesson access outcome`() {
        assertEquals(
            setOf(
                "LINK_CREATED", "LINK_ROTATED", "LINK_REVOKED", "LINK_STARTED",
                "CHALLENGE_REQUESTED", "CHALLENGE_VERIFIED",
                "LOBBY_REQUESTED", "LOBBY_APPROVED", "LOBBY_DENIED",
                "STUDENT_KICKED", "STUDENT_READMITTED", "ASSERTION_ISSUED", "SESSION_REVOKED",
            ),
            LessonAccessAuditEvent.entries.map(Enum<*>::name).toSet(),
        )
        assertEquals(setOf("ACCEPTED", "REJECTED", "PARTIAL"), LessonAccessAuditOutcome.entries.map(Enum<*>::name).toSet())
    }
}
