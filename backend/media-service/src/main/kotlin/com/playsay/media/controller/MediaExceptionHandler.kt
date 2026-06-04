package com.playsay.media.controller

import com.playsay.media.service.MediaServiceException
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler

@ControllerAdvice
class MediaExceptionHandler {
    @ExceptionHandler(MediaServiceException::class)
    fun handle(exception: MediaServiceException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(exception.status).body(mapOf("code" to exception.code))
}
