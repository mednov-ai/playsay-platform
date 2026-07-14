package com.playsay.vocabulary.controller

import com.playsay.vocabulary.service.VocabularyUserDataService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class VocabularyUserDataController(private val userData: VocabularyUserDataService) {
    @DeleteMapping("/internal/user-data/{subject}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun purge(
        @PathVariable subject: String,
        @RequestHeader("X-PlaySay-Service-Token", required = false) serviceToken: String?,
    ) = userData.purge(subject, serviceToken)
}
