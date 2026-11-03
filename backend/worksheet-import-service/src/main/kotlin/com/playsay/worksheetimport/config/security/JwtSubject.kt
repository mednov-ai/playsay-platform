package com.playsay.worksheetimport.config.security

import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.server.ResponseStatusException

fun Jwt.requireSubject(): String =
    subject?.takeIf { it.isNotBlank() }
        ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid token subject.")
