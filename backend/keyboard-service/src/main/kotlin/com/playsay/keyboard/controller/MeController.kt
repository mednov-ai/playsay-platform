package com.playsay.keyboard.controller

import com.playsay.keyboard.dto.MeResponse
import com.playsay.keyboard.mapper.applicationRoles
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api")
class MeController {
    @GetMapping("/me")
    fun me(authentication: JwtAuthenticationToken): MeResponse =
        MeResponse(
            subject = authentication.token.subject,
            username = authentication.token.getClaimAsString("preferred_username"),
            email = authentication.token.getClaimAsString("email"),
            roles = authentication.applicationRoles(),
        )
}
