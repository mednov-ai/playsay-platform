package com.playsay.gateway.controller

import com.playsay.gateway.dto.AttachStudentRequest
import com.playsay.gateway.dto.CreateDelegationRequest
import com.playsay.gateway.dto.TeacherDelegationResponse
import com.playsay.gateway.dto.TeacherDirectoryEntry
import com.playsay.gateway.dto.TeacherStudentResponse
import com.playsay.gateway.dto.UpdateStudentLessonTranslationPermissionRequest
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
class TeacherManagementController(
    private val service: TeacherDelegationService,
) {
    @GetMapping("/teacher/students", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun students(authentication: JwtAuthenticationToken): List<TeacherStudentResponse> =
        service.listTeacherStudents(authentication)

    @PostMapping(
        "/teacher/students/attach",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun attach(
        authentication: JwtAuthenticationToken,
        @Valid @RequestBody request: AttachStudentRequest,
    ): TeacherStudentResponse = service.attachStudent(authentication, request)

    @PutMapping(
        "/teacher/students/{subject}/lesson-translation-permission",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun updateLessonTranslationPermission(
        authentication: JwtAuthenticationToken,
        @PathVariable subject: String,
        @Valid @RequestBody request: UpdateStudentLessonTranslationPermissionRequest,
    ): TeacherStudentResponse = service.updateLessonTranslationPermission(authentication, subject, request)

    @DeleteMapping("/teacher/students/{subject}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun detach(authentication: JwtAuthenticationToken, @PathVariable subject: String) =
        service.detachStudent(authentication, subject)

    @GetMapping("/teachers/directory", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun directory(authentication: JwtAuthenticationToken): List<TeacherDirectoryEntry> =
        service.teacherDirectory(authentication)

    @GetMapping("/teacher/delegations", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun delegations(
        authentication: JwtAuthenticationToken,
        @RequestParam(defaultValue = "granted") direction: String,
        @RequestParam(required = false) status: String?,
    ): List<TeacherDelegationResponse> = service.listTeacher(authentication, direction, status)

    @PostMapping(
        "/teacher/delegations",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.CREATED)
    fun createDelegation(
        authentication: JwtAuthenticationToken,
        @Valid @RequestBody request: CreateDelegationRequest,
    ): List<TeacherDelegationResponse> = service.create(authentication, request)

    @DeleteMapping("/teacher/delegations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revokeDelegation(authentication: JwtAuthenticationToken, @PathVariable id: UUID) =
        service.revoke(authentication, id)
}
