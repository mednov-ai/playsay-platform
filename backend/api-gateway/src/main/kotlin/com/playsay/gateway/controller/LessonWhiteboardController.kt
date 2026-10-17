package com.playsay.gateway.controller

import com.playsay.gateway.dto.LessonWhiteboardContextResponse
import com.playsay.gateway.dto.LessonWhiteboardResponse
import com.playsay.gateway.dto.LessonWhiteboardSummaryResponse
import com.playsay.gateway.dto.UpdateLessonWhiteboardRequest
import com.playsay.gateway.dto.WhiteboardPolicyRequest
import com.playsay.gateway.dto.WhiteboardPolicyResponse
import com.playsay.gateway.service.LessonWhiteboardService
import io.swagger.v3.oas.annotations.Operation
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class LessonWhiteboardController(private val service: LessonWhiteboardService) {
    @GetMapping("/schedule/lessons/{lessonId}/whiteboard", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "getLessonWhiteboardContext")
    fun current(authentication: JwtAuthenticationToken, @PathVariable lessonId: UUID, @RequestParam(required = false) studentSubject: String?): LessonWhiteboardContextResponse =
        service.current(authentication, lessonId, studentSubject)

    @PostMapping("/schedule/lessons/{lessonId}/whiteboard", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "ensureLessonWhiteboard")
    fun ensure(authentication: JwtAuthenticationToken, @PathVariable lessonId: UUID, @RequestParam(required = false) studentSubject: String?): LessonWhiteboardResponse =
        service.ensure(authentication, lessonId, studentSubject)

    @GetMapping("/schedule/lessons/{lessonId}/whiteboards/{boardId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "getLessonWhiteboard")
    fun get(authentication: JwtAuthenticationToken, @PathVariable lessonId: UUID, @PathVariable boardId: UUID): LessonWhiteboardResponse =
        service.get(authentication, lessonId, boardId)

    @GetMapping("/schedule/lessons/{lessonId}/whiteboards", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "listLessonWhiteboards")
    fun history(authentication: JwtAuthenticationToken, @PathVariable lessonId: UUID): List<LessonWhiteboardSummaryResponse> = service.history(authentication, lessonId)

    @PutMapping("/schedule/lessons/{lessonId}/whiteboards/{boardId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "updateLessonWhiteboard")
    fun update(authentication: JwtAuthenticationToken, @PathVariable lessonId: UUID, @PathVariable boardId: UUID, @RequestBody request: UpdateLessonWhiteboardRequest): LessonWhiteboardResponse =
        service.update(authentication, lessonId, boardId, request)

    @PostMapping("/internal/whiteboards/{documentId}/policy", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(hidden = true)
    fun policy(@RequestHeader("X-PlaySay-Collaboration-Service-Token", required = false) token: String?, @PathVariable documentId: UUID, @RequestBody request: WhiteboardPolicyRequest): WhiteboardPolicyResponse =
        service.policy(token, documentId, request)
}
