package com.playsay.gateway.service

import com.playsay.gateway.error.ProjectResponseException
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

@Component
class LessonMaintenanceGuard(
    @param:Value("\${playsay.games.maintenance:false}") private val maintenance: Boolean,
) {
    fun requireLessonAdmission() {
        if (maintenance) {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, "GAME_MAINTENANCE")
        }
    }
}
