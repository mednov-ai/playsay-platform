package com.playsay.aitutor.service

import com.playsay.aitutor.dto.AgePolicy
import com.playsay.aitutor.repo.LearnerAppUserRepository
import com.playsay.aitutor.repo.LearnerStudentProfileRepository
import java.time.Clock
import java.time.LocalDate
import java.time.Period
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

@Service
class LearnerAgePolicyService(
    private val users: LearnerAppUserRepository,
    private val studentProfiles: LearnerStudentProfileRepository,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun resolve(subject: String): AgePolicy {
        val user = users.findByKeycloakSubject(subject)
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Complete your Honey School profile before starting AI practice")
        if (!user.hasRole("STUDENT")) {
            return AgePolicy.ADULT
        }

        val birthDate = studentProfiles.findByUserId(user.id)?.birthDate
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Birth date is required in the learner profile")
        val today = LocalDate.now(clock)
        if (!birthDate.isBefore(today) || birthDate.isBefore(today.minusYears(MAX_AGE.toLong()))) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Birth date in the learner profile is invalid")
        }

        return when (Period.between(birthDate, today).years) {
            in 0 until CHILD_MAX_AGE -> AgePolicy.CHILD
            in CHILD_MAX_AGE until ADULT_MIN_AGE -> AgePolicy.TEEN
            else -> AgePolicy.ADULT
        }
    }

    private fun com.playsay.aitutor.entity.LearnerAppUserEntity.hasRole(role: String): Boolean =
        roles.orEmpty().split(',').any { it.trim() == role }

    private companion object {
        const val CHILD_MAX_AGE = 13
        const val ADULT_MIN_AGE = 18
        const val MAX_AGE = 120
    }
}
