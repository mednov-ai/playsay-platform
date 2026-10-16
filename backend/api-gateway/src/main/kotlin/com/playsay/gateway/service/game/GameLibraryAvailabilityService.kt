package com.playsay.gateway.service.game

import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class GameLibraryAvailabilityService(
    @param:Value("\${playsay.games.writes-enabled:true}") private val writesEnabled: Boolean = true,
    @param:Value("\${playsay.games.maintenance:false}") private val maintenance: Boolean = false,
) {
    fun requireWrites() { if (!writesEnabled || maintenance) gameError(HttpStatus.SERVICE_UNAVAILABLE, "GAME_WRITES_DISABLED") }
    fun requireBackgroundProcessing() { if (maintenance) gameError(HttpStatus.SERVICE_UNAVAILABLE, "GAME_MAINTENANCE") }
    fun requireLessonAdmission() { if (maintenance) gameError(HttpStatus.SERVICE_UNAVAILABLE, "GAME_MAINTENANCE") }
}
