package com.playsay.keyboard.repo

import com.playsay.keyboard.entity.TechniqueAdviceCacheEntity
import org.springframework.data.jpa.repository.JpaRepository

interface TechniqueAdviceCacheRepo : JpaRepository<TechniqueAdviceCacheEntity, Long> {
    fun findByFingerprintAndLocale(fingerprint: String, locale: String): TechniqueAdviceCacheEntity?
}
