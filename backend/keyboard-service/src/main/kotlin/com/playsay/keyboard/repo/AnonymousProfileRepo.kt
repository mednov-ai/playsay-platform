package com.playsay.keyboard.repo

import com.playsay.keyboard.entity.AnonymousProfileEntity
import org.springframework.data.jpa.repository.JpaRepository

interface AnonymousProfileRepo : JpaRepository<AnonymousProfileEntity, Long> {
    fun findByDeviceId(deviceId: String): AnonymousProfileEntity?
}
