package com.playsay.aitutor.service

import org.springframework.http.HttpStatusCode
import org.springframework.web.server.ResponseStatusException

class AiTutorResponseException(
    status: HttpStatusCode,
    val errorCode: String,
    message: String,
) : ResponseStatusException(status, message)

object AiTutorErrorCodes {
    const val DIALOG_CREDITS_EXHAUSTED = "AI_DIALOG_CREDITS_EXHAUSTED"
    const val DIALOG_ALREADY_ACTIVE = "AI_DIALOG_ALREADY_ACTIVE"
    const val DIALOG_REQUEST_CONFLICT = "AI_DIALOG_REQUEST_CONFLICT"
    const val DIALOG_ACCESS_DENIED = "AI_DIALOG_ACCESS_DENIED"
    const val DIALOG_GRANT_CONFLICT = "AI_DIALOG_GRANT_CONFLICT"
}
