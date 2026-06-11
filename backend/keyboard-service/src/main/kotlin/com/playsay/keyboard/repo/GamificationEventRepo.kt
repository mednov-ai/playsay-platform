package com.playsay.keyboard.repo

import com.playsay.keyboard.entity.GamificationEventEntity
import org.springframework.data.jpa.repository.JpaRepository

interface GamificationEventRepo : JpaRepository<GamificationEventEntity, Long> {
    fun findByKeycloakSubjectOrderByCreatedAtDesc(keycloakSubject: String): List<GamificationEventEntity>
    fun findByAnonymousProfileIdOrderByCreatedAtDesc(anonymousProfileId: Long): List<GamificationEventEntity>
}
