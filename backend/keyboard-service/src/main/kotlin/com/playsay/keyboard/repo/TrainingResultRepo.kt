package com.playsay.keyboard.repo

import com.playsay.keyboard.entity.TrainingResultEntity
import org.springframework.data.jpa.repository.JpaRepository

interface TrainingResultRepo : JpaRepository<TrainingResultEntity, Long> {
    fun findByKeycloakSubjectOrderByCreatedAtDesc(keycloakSubject: String): List<TrainingResultEntity>
    fun findByAnonymousProfileIdOrderByCreatedAtDesc(anonymousProfileId: Long): List<TrainingResultEntity>
    fun countByAnonymousProfileId(anonymousProfileId: Long): Int
}
