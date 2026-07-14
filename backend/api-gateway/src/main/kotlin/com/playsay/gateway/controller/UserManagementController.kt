package com.playsay.gateway.controller

import com.playsay.gateway.dto.CreateUserManagementUserRequest
import com.playsay.gateway.dto.UpdateUserRolesRequest
import com.playsay.gateway.dto.UserDeletionOperationResponse
import com.playsay.gateway.dto.UserManagementUser
import com.playsay.gateway.service.UserManagementService
import jakarta.validation.Valid
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
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
class UserManagementController(
    private val service: UserManagementService,
) {
    @GetMapping("/admin/user-management/users", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun users(
        authentication: JwtAuthenticationToken,
        @RequestParam(required = false) query: String?,
        @RequestParam(required = false) role: String?,
        @RequestParam(required = false) status: String?,
    ): List<UserManagementUser> = service.list(authentication, query, role, status)

    @PostMapping(
        "/admin/user-management/users",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        authentication: JwtAuthenticationToken,
        @Valid @RequestBody request: CreateUserManagementUserRequest,
    ): UserManagementUser = service.create(authentication, request)

    @PutMapping(
        "/admin/user-management/users/{subject}/roles",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun updateRoles(
        authentication: JwtAuthenticationToken,
        @PathVariable subject: String,
        @Valid @RequestBody request: UpdateUserRolesRequest,
    ): UserManagementUser = service.updateRoles(authentication, subject, request)

    @DeleteMapping("/admin/user-management/users/{subject}", produces = [MediaType.APPLICATION_JSON_VALUE])
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun delete(
        authentication: JwtAuthenticationToken,
        @PathVariable subject: String,
        @RequestParam(required = false) replacementTeacherSubject: String?,
    ): UserDeletionOperationResponse = service.requestDeletion(authentication, subject, replacementTeacherSubject)

    @GetMapping(
        "/admin/user-management/operations/{operationId}",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun operation(
        authentication: JwtAuthenticationToken,
        @PathVariable operationId: UUID,
    ): UserDeletionOperationResponse = service.operation(authentication, operationId)
}
