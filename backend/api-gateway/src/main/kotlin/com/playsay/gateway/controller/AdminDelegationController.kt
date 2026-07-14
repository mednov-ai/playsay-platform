package com.playsay.gateway.controller

import com.playsay.gateway.dto.AssignPrimaryTeacherRequest
import com.playsay.gateway.dto.CreateDelegationRequest
import com.playsay.gateway.dto.TeacherDelegationResponse
import com.playsay.gateway.dto.TeacherStudentResponse
import com.playsay.gateway.service.TeacherDelegationService
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
class AdminDelegationController(
    private val service: TeacherDelegationService,
) {
    @PutMapping(
        "/admin/user-management/students/{subject}/teacher",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun assignTeacher(
        authentication: JwtAuthenticationToken,
        @PathVariable subject: String,
        @Valid @RequestBody request: AssignPrimaryTeacherRequest,
    ): TeacherStudentResponse = service.assignPrimaryTeacher(authentication, subject, request.teacherSubject)

    @DeleteMapping("/admin/user-management/students/{subject}/teacher")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun removeTeacher(authentication: JwtAuthenticationToken, @PathVariable subject: String) =
        service.removePrimaryTeacher(authentication, subject)

    @GetMapping("/admin/user-management/delegations", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun delegations(
        authentication: JwtAuthenticationToken,
        @RequestParam(required = false) status: String?,
    ): List<TeacherDelegationResponse> = service.listAdmin(authentication, status)

    @PostMapping(
        "/admin/user-management/delegations",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.CREATED)
    fun createDelegation(
        authentication: JwtAuthenticationToken,
        @Valid @RequestBody request: CreateDelegationRequest,
    ): List<TeacherDelegationResponse> = service.create(authentication, request)

    @DeleteMapping("/admin/user-management/delegations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revokeDelegation(authentication: JwtAuthenticationToken, @PathVariable id: UUID) =
        service.revoke(authentication, id)
}
