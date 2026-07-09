package com.playsay.gateway.controller

import com.playsay.gateway.dto.StudentInviteConsumeRequest
import com.playsay.gateway.dto.StudentInviteConsumeResponse
import com.playsay.gateway.service.RegistrationGateway
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class StudentInviteController(
    private val registrationGateway: RegistrationGateway,
) {
    @PostMapping(
        path = ["/student-invites/consume", "/api/student-invites/consume"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun consume(
        @Valid @RequestBody request: StudentInviteConsumeRequest,
    ): StudentInviteConsumeResponse =
        registrationGateway.consumeStudentInvite(request)
}
