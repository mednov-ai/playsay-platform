package com.playsay.aitutor.controller

import com.playsay.aitutor.dto.AiTutorErrorResponse
import com.playsay.aitutor.service.AiTutorResponseException
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class AiTutorExceptionHandler {
    @ExceptionHandler(AiTutorResponseException::class)
    fun handle(exception: AiTutorResponseException): ResponseEntity<AiTutorErrorResponse> =
        ResponseEntity
            .status(exception.statusCode)
            .body(
                AiTutorErrorResponse(
                    status = exception.statusCode.value(),
                    errorCode = exception.errorCode,
                    message = exception.reason.orEmpty(),
                ),
            )
}
