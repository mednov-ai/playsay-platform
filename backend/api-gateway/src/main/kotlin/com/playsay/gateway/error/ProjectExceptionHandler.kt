package com.playsay.gateway.error

import com.playsay.gateway.service.MessageProvider
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class ProjectExceptionHandler(
    private val messageProvider: MessageProvider,
) {
    @ExceptionHandler(ProjectResponseException::class)
    fun handleProjectResponseException(exception: ProjectResponseException): ResponseEntity<ProjectErrorResponse> {
        val message = exception.messageCode
            ?.let { messageCode -> messageProvider.get(messageCode, *exception.messageArgs) }
            ?: exception.reason.orEmpty()

        return ResponseEntity
            .status(exception.statusCode)
            .body(
                ProjectErrorResponse(
                    status = exception.statusCode.value(),
                    errorCode = exception.errorCode,
                    message = message,
                ),
            )
    }
}
