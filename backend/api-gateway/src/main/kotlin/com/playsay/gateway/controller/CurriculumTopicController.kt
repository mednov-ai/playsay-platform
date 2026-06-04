package com.playsay.gateway.controller

import com.playsay.gateway.dto.CurriculumTopicRequest
import com.playsay.gateway.dto.CurriculumTopicResponse
import com.playsay.gateway.service.CurriculumTopicStore
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Curriculum topics")
class CurriculumTopicController(
    private val store: CurriculumTopicStore,
) {
    @GetMapping("/courses/{courseId}/topics", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listCurriculumTopics",
        summary = "List curriculum topics",
        description = "Returns controlled curriculum topics inside a course/level track.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun listTopics(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
    ): List<CurriculumTopicResponse> =
        store.listTopics(authentication, courseId)

    @PostMapping(
        "/courses/{courseId}/topics",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createCurriculumTopic",
        summary = "Create curriculum topic",
        description = "Creates a controlled curriculum topic. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun createTopic(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
        @RequestBody request: CurriculumTopicRequest,
    ): ResponseEntity<CurriculumTopicResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(store.createTopic(authentication, courseId, request))

    @PutMapping(
        "/courses/{courseId}/topics/{topicId}",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "updateCurriculumTopic",
        summary = "Update curriculum topic",
        description = "Updates a controlled curriculum topic. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun updateTopic(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
        @PathVariable topicId: UUID,
        @RequestBody request: CurriculumTopicRequest,
    ): CurriculumTopicResponse =
        store.updateTopic(authentication, courseId, topicId, request)

    @DeleteMapping("/courses/{courseId}/topics/{topicId}")
    @Operation(
        operationId = "deleteCurriculumTopic",
        summary = "Delete curriculum topic",
        description = "Deletes a controlled curriculum topic. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun deleteTopic(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
        @PathVariable topicId: UUID,
    ): ResponseEntity<Void> {
        store.deleteTopic(authentication, courseId, topicId)
        return ResponseEntity.noContent().build()
    }
}
