package com.playsay.aitutor.service

import com.playsay.aitutor.dto.AgePolicy
import com.playsay.aitutor.entity.LearnerAppUserEntity
import com.playsay.aitutor.entity.LearnerStudentProfileEntity
import com.playsay.aitutor.repo.LearnerAppUserRepository
import com.playsay.aitutor.repo.LearnerStudentProfileRepository
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import org.mockito.Mockito

class LearnerAgePolicyServiceTest {
    private val users = Mockito.mock(LearnerAppUserRepository::class.java)
    private val profiles = Mockito.mock(LearnerStudentProfileRepository::class.java)
    private val clock = Clock.fixed(Instant.parse("2026-07-11T00:00:00Z"), ZoneOffset.UTC)
    private val service = LearnerAgePolicyService(users, profiles, clock)

    @Test
    fun `derives child teen and adult policies from profile birth date`() {
        assertPolicy(LocalDate.parse("2014-07-12"), AgePolicy.CHILD)
        assertPolicy(LocalDate.parse("2013-07-11"), AgePolicy.TEEN)
        assertPolicy(LocalDate.parse("2008-07-11"), AgePolicy.ADULT)
    }

    @Test
    fun `requires birth date for a student`() {
        val user = student()
        Mockito.`when`(users.findByKeycloakSubject("student-1")).thenReturn(user)
        Mockito.`when`(profiles.findByUserId(user.id)).thenReturn(null)

        assertFails { service.resolve("student-1") }
    }

    @Test
    fun `uses adult policy for a non-student role`() {
        Mockito.`when`(users.findByKeycloakSubject("teacher-1"))
            .thenReturn(LearnerAppUserEntity(roles = "TEACHER"))

        assertEquals(AgePolicy.ADULT, service.resolve("teacher-1"))
    }

    private fun assertPolicy(birthDate: LocalDate, expected: AgePolicy) {
        val user = student()
        Mockito.`when`(users.findByKeycloakSubject("student-1")).thenReturn(user)
        Mockito.`when`(profiles.findByUserId(user.id)).thenReturn(
            LearnerStudentProfileEntity(userId = user.id, birthDate = birthDate),
        )

        assertEquals(expected, service.resolve("student-1"))
    }

    private fun student() = LearnerAppUserEntity(
        id = UUID.randomUUID(),
        keycloakSubject = "student-1",
        roles = "STUDENT",
    )
}
