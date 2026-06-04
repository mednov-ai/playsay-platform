package com.playsay.media.service

import org.springframework.http.HttpStatus

class MediaInternalAuth(
    private val serviceToken: String,
) {
    fun requireValid(value: String?) {
        val expected = serviceToken.trim()
        if (expected.length < 16 || value?.trim() != expected) {
            throw MediaServiceException(HttpStatus.UNAUTHORIZED, "MEDIA_SERVICE_TOKEN_REQUIRED")
        }
    }
}
