package com.playsay.gateway.error

import com.playsay.gateway.utils.MetaData
import org.springframework.http.HttpStatusCode
import org.springframework.web.server.ResponseStatusException

class ProjectResponseException(
    status: HttpStatusCode,
    message: String,
    val errorCode: String = MetaData.ErrorCodes.INVALID_REQUEST,
    val messageCode: String? = null,
    val messageArgs: Array<out Any> = emptyArray(),
) : ResponseStatusException(status, message) {
    companion object {
        fun localized(
            status: HttpStatusCode,
            errorCode: String,
            vararg messageArgs: Any,
        ): ProjectResponseException =
            ProjectResponseException(
                status = status,
                message = errorCode,
                errorCode = errorCode,
                messageCode = errorCode,
                messageArgs = messageArgs,
            )
    }
}
