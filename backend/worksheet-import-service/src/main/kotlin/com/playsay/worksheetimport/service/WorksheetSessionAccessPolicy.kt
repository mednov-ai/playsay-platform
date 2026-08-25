package com.playsay.worksheetimport.service

import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component

@Component
class WorksheetSessionAccessPolicy {
    fun canCreate(authentication: JwtAuthenticationToken): Boolean =
        authentication.hasRole("TEACHER") || authentication.hasRole("ADMIN")

    fun canAccess(authentication: JwtAuthenticationToken, ownerSubject: String): Boolean =
        authentication.token.subject == ownerSubject || authentication.hasRole("ADMIN")

    private fun JwtAuthenticationToken.hasRole(role: String) =
        authorities.any { authority -> authority.authority == "ROLE_$role" }
}
