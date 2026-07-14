package com.playsay.aitutor.controller

import com.playsay.aitutor.service.AiTutorUserDataService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class AiTutorUserDataController(private val userData: AiTutorUserDataService) {
    @DeleteMapping("/internal/user-data/{subject}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun purge(
        @PathVariable subject: String,
        @RequestHeader("X-PlaySay-Service-Token", required = false) serviceToken: String?,
    ) = userData.purge(subject, serviceToken)
}
