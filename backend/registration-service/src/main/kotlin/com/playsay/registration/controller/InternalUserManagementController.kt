package com.playsay.registration.controller

import com.playsay.registration.dto.InternalCreateUserRequest
import com.playsay.registration.dto.InternalUpdateRolesRequest
import com.playsay.registration.dto.InternalUserIdentityResponse
import com.playsay.registration.service.CreateKeycloakManagedIdentityCommand
import com.playsay.registration.service.KeycloakManagedIdentity
import com.playsay.registration.service.KeycloakUserManagementService
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class InternalUserManagementController(
    private val service: KeycloakUserManagementService,
) {
    @GetMapping("/api/internal/user-management/users/exact", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun findExact(@RequestParam identifier: String): InternalUserIdentityResponse? =
        service.findExact(identifier)?.toResponse()

    @PostMapping(
        "/api/internal/user-management/users",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@Valid @RequestBody request: InternalCreateUserRequest): InternalUserIdentityResponse =
        service.create(
            CreateKeycloakManagedIdentityCommand(
                username = request.username,
                firstName = request.firstName,
                lastName = request.lastName,
                email = request.email,
                roles = request.roles,
                managedStudent = request.managedStudent,
            ),
        ).toResponse()

    @PutMapping(
        "/api/internal/user-management/users/{subject}/roles",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun updateRoles(
        @PathVariable subject: String,
        @RequestBody request: InternalUpdateRolesRequest,
    ): InternalUserIdentityResponse = service.updateRoles(subject, request.roles).toResponse()

    @DeleteMapping("/api/internal/user-management/users/{subject}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable subject: String) = service.delete(subject)
}

private fun KeycloakManagedIdentity.toResponse(): InternalUserIdentityResponse =
    InternalUserIdentityResponse(subject, username, email, displayName, roles, enabled)
