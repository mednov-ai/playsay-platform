package com.playsay.registration.controller

import com.playsay.registration.dto.InternalAuthenticationMethodsResponse
import com.playsay.registration.dto.InternalPasskeyCredentialResponse
import com.playsay.registration.dto.InternalRenamePasskeyRequest
import com.playsay.registration.service.AuthenticationMethods
import com.playsay.registration.service.AuthenticationMethodsService
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class InternalAuthenticationMethodsController(
    private val service: AuthenticationMethodsService,
) {
    @GetMapping(
        "/api/internal/authentication-methods/users/{subject}",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun get(@PathVariable subject: String): InternalAuthenticationMethodsResponse =
        service.get(subject).toResponse()

    @PutMapping(
        "/api/internal/authentication-methods/users/{subject}/passkeys/{credentialId}",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun rename(
        @PathVariable subject: String,
        @PathVariable credentialId: String,
        @Valid @RequestBody request: InternalRenamePasskeyRequest,
    ): InternalAuthenticationMethodsResponse =
        service.renamePasskey(subject, credentialId, request.label).toResponse()

    @DeleteMapping(
        "/api/internal/authentication-methods/users/{subject}/passkeys/{credentialId}",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun delete(
        @PathVariable subject: String,
        @PathVariable credentialId: String,
    ): InternalAuthenticationMethodsResponse = service.deletePasskey(subject, credentialId).toResponse()
}

private fun AuthenticationMethods.toResponse(): InternalAuthenticationMethodsResponse =
    InternalAuthenticationMethodsResponse(
        hasPassword = hasPassword,
        passkeys = passkeys.map { InternalPasskeyCredentialResponse(it.id, it.label, it.createdAt) },
    )
