package com.playsay.gateway.controller

import com.playsay.gateway.service.LessonRememberedSessionService
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class LessonRememberedSessionController(private val service: LessonRememberedSessionService) {
    @DeleteMapping("/users/me/lesson-sessions/current")
    fun revokeCurrent(authentication: JwtAuthenticationToken): ResponseEntity<Void> {
        service.revokeCurrent(authentication)
        return ResponseEntity.noContent().build()
    }

    @DeleteMapping("/users/me/lesson-sessions")
    fun revokeAll(authentication: JwtAuthenticationToken): ResponseEntity<Void> {
        service.revokeAll(authentication)
        return ResponseEntity.noContent().build()
    }
}
