package com.playsay.gateway.error

import com.playsay.gateway.utils.MetaData
import org.springframework.http.HttpStatusCode
import org.springframework.web.server.ResponseStatusException

class ProjectResponseException(
    status: HttpStatusCode,
    message: String,
    val errorCode: String = MetaData.ErrorCodes.INVALID_REQUEST,
) : ResponseStatusException(status, message)
