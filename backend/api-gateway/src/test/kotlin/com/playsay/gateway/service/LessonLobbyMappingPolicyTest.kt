package com.playsay.gateway.service

import com.playsay.contract.registration.model.InternalUserIdentityResponse
import kotlin.test.Test
import kotlin.test.assertEquals

class LessonLobbyMappingPolicyTest {
    @Test
    fun `only the exact enabled rostered student can be mapped from lobby`() {
        val student = identity("student-1", setOf("STUDENT"))
        val cases = listOf(
            Case("exact enabled student", student, "student-1", true, true),
            Case("not rostered", student, "student-1", false, false),
            Case("different subject", student, "student-2", true, false),
            Case("missing identity", null, "student-1", true, false),
            Case("disabled student", student.copy(enabled = false), "student-1", true, false),
            Case("teacher", identity("teacher-1", setOf("TEACHER")), "teacher-1", true, false),
            Case("admin", identity("admin-1", setOf("ADMIN")), "admin-1", true, false),
            Case("student with teacher role", identity("mixed-1", setOf("STUDENT", "TEACHER")), "mixed-1", true, false),
            Case("student with admin role", identity("mixed-2", setOf("STUDENT", "ADMIN")), "mixed-2", true, false),
        )

        cases.forEach { case ->
            assertEquals(
                case.expected,
                LessonLobbyMappingPolicy.canMap(case.identity, case.requestedSubject, case.rostered),
                case.name,
            )
        }
    }

    private fun identity(subject: String, roles: Set<String>) = InternalUserIdentityResponse(
        subject = subject,
        username = subject,
        email = "$subject@example.test",
        displayName = subject,
        roles = roles,
        enabled = true,
    )

    private data class Case(
        val name: String,
        val identity: InternalUserIdentityResponse?,
        val requestedSubject: String,
        val rostered: Boolean,
        val expected: Boolean,
    )
}
