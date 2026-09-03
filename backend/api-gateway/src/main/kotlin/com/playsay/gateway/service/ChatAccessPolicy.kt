package com.playsay.gateway.service

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

object ChatAccessPolicy {
    fun allows(authentication: JwtAuthenticationToken): Boolean = authentication.authorities.any {
        it.authority == MetaData.Authorities.TEACHER || it.authority == MetaData.Authorities.STUDENT
    }

    fun requireAccess(authentication: JwtAuthenticationToken) {
        if (!allows(authentication)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.CHAT_ROLE_REQUIRED)
        }
    }
}
