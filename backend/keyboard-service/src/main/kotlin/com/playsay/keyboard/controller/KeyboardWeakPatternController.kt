package com.playsay.keyboard.controller

import com.playsay.keyboard.dto.KeyboardWeakPatternResponse
import com.playsay.keyboard.service.KeyboardWeakPatternService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

@RestController
class KeyboardWeakPatternController(private val weakPatterns: KeyboardWeakPatternService) {
    @GetMapping("/internal/keyboard/weak-patterns/{subject}")
    fun forSubject(
        @PathVariable subject: String,
        @RequestHeader("X-PlaySay-Service-Token", required = false) serviceToken: String?,
    ): KeyboardWeakPatternResponse = weakPatterns.forSubject(subject, serviceToken)
}
