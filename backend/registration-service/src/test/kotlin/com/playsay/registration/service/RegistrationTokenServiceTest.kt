package com.playsay.registration.service

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class RegistrationTokenServiceTest {
    private val service = RegistrationTokenService()

    @Test
    fun `student invite code is short uppercase for manual entry`() {
        val code = service.newStudentInviteCode()

        assertTrue(Regex("^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$").matches(code))
    }

    @Test
    fun `student invite code normalization accepts lowercase spaces and missing separators`() {
        assertEquals("A7K2Q9", service.normalizeStudentInviteCode(" a7k-2q9 "))
        assertEquals("A7K2Q9", service.normalizeStudentInviteCode("a7k 2q9"))
    }

    @Test
    fun `student invite codes are random`() {
        assertNotEquals(service.newStudentInviteCode(), service.newStudentInviteCode())
    }
}
