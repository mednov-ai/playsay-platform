package com.playsay.media.service

import org.springframework.http.HttpStatus

class MediaServiceException(
    val status: HttpStatus,
    val code: String,
    message: String = code,
    cause: Throwable? = null,
) : RuntimeException(message, cause)
