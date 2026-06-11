package com.playsay.keyboard.repo

import com.playsay.keyboard.entity.GamificationProfileEntity
import org.springframework.data.jpa.repository.JpaRepository

interface GamificationProfileRepo : JpaRepository<GamificationProfileEntity, Long> {
    fun findByKeycloakSubject(keycloakSubject: String): GamificationProfileEntity?
    fun findByAnonymousProfileId(anonymousProfileId: Long): GamificationProfileEntity?
}
