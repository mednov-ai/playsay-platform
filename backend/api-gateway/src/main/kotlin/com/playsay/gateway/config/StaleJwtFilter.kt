package com.playsay.gateway.config

import com.playsay.gateway.repo.AppUserRepo
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.time.Instant
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class StaleJwtFilter(
    private val appUserRepo: AppUserRepo,
) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        val authentication = SecurityContextHolder.getContext().authentication as? JwtAuthenticationToken
        if (authentication != null) {
            val user = appUserRepo.findByKeycloakSubject(authentication.token.subject)
            val rolesChangedAt = user?.rolesChangedAt
            val issuedAt = authentication.token.issuedAt ?: Instant.EPOCH
            if (rolesChangedAt != null && issuedAt.isBefore(rolesChangedAt)) {
                SecurityContextHolder.clearContext()
                response.sendError(HttpStatus.UNAUTHORIZED.value(), "Access token was issued before the latest role change.")
                return
            }
        }
        filterChain.doFilter(request, response)
    }
}
