package com.playsay.gateway

import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

data class MeResponse(
    val subject: String,
    val username: String?,
    val email: String?,
    val name: String?,
    val roles: List<String>,
)

@RestController
class MeController {
    @GetMapping("/me")
    fun me(authentication: JwtAuthenticationToken): MeResponse {
        val jwt = authentication.token
        val roles = authentication.authorities
            .mapNotNull { authority -> authority.authority }
            .filter { authority -> authority.startsWith("ROLE_") }
            .map { authority -> authority.removePrefix("ROLE_") }
            .sorted()

        return MeResponse(
            subject = jwt.subject,
            username = jwt.getClaimAsString("preferred_username"),
            email = jwt.getClaimAsString("email"),
            name = jwt.getClaimAsString("name"),
            roles = roles,
        )
    }
}
