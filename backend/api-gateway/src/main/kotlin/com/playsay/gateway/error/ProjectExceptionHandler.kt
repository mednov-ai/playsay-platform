package com.playsay.gateway.error

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class ProjectExceptionHandler {
    @ExceptionHandler(ProjectResponseException::class)
    fun handleProjectResponseException(exception: ProjectResponseException): ResponseEntity<ProjectErrorResponse> =
        ResponseEntity
            .status(exception.statusCode)
            .body(
                ProjectErrorResponse(
                    status = exception.statusCode.value(),
                    errorCode = exception.errorCode,
                    message = exception.reason.orEmpty(),
                ),
            )
}
