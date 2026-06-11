package com.playsay.keyboard.repo

import com.playsay.keyboard.entity.LayoutMasteryProfileEntity
import org.springframework.data.jpa.repository.JpaRepository

interface LayoutMasteryProfileRepo : JpaRepository<LayoutMasteryProfileEntity, Long> {
    fun findByKeycloakSubjectAndLayout(keycloakSubject: String, layout: String): LayoutMasteryProfileEntity?
    fun findByAnonymousProfileIdAndLayout(anonymousProfileId: Long, layout: String): LayoutMasteryProfileEntity?
    fun findByKeycloakSubjectOrderByLayoutAsc(keycloakSubject: String): List<LayoutMasteryProfileEntity>
    fun findByAnonymousProfileIdOrderByLayoutAsc(anonymousProfileId: Long): List<LayoutMasteryProfileEntity>
}
