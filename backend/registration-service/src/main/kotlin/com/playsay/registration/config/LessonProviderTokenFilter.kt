package com.playsay.registration.config

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class LessonProviderTokenFilter(
    @param:Value("\${playsay.registration.lesson-auth.provider-token:}") private val expectedToken: String,
) : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean = !request.requestURI.startsWith(providerPrefix)

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        val presented = request.getHeader(providerTokenHeader).orEmpty()
        val valid = expectedToken.isNotBlank() && MessageDigest.isEqual(
            expectedToken.toByteArray(StandardCharsets.UTF_8),
            presented.toByteArray(StandardCharsets.UTF_8),
        )
        if (!valid) {
            response.sendError(if (expectedToken.isBlank()) HttpStatus.SERVICE_UNAVAILABLE.value() else HttpStatus.UNAUTHORIZED.value())
            return
        }
        filterChain.doFilter(request, response)
    }

    private companion object {
        const val providerPrefix = "/api/provider/lesson-auth/"
        const val providerTokenHeader = "X-PlaySay-Lesson-Provider-Token"
    }
}
