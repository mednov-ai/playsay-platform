package com.playsay.gateway.controller

import com.playsay.gateway.dto.StudentVocabularyAssignmentDetailResponse
import com.playsay.gateway.dto.TeacherAssignmentDetailResponse
import com.playsay.gateway.dto.VocabularyHomeworkRequest
import com.playsay.gateway.service.assignment.AssignmentStore
import com.playsay.gateway.service.assignment.VocabularyAssignmentOutboxProcessor
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Assignments")
class VocabularyHomeworkController(
    private val store: AssignmentStore,
    private val vocabularyAssignments: VocabularyAssignmentOutboxProcessor,
) {
    @PostMapping(
        "/assignments/vocabulary",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createVocabularyHomeworkAssignment",
        summary = "Create vocabulary homework assignment",
        description = "Creates an assignment envelope and immutable personal vocabulary session for every selected student.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun createVocabularyHomeworkAssignment(
        authentication: JwtAuthenticationToken,
        @RequestBody request: VocabularyHomeworkRequest,
    ): ResponseEntity<TeacherAssignmentDetailResponse> {
        val created = try {
            store.createVocabularyHomework(authentication, request)
        } catch (error: DataIntegrityViolationException) {
            request.planId?.let { planId -> store.findVocabularyHomeworkByPlan(authentication, planId) }
                ?: request.sourcePracticeId?.let { practiceId ->
                    store.findVocabularyHomeworkBySourcePractice(authentication, practiceId)
                }
                ?: throw error
        }
        vocabularyAssignments.processAssignment(created.assignment.id)
        return ResponseEntity.status(HttpStatus.CREATED).body(
            store.teacherDetail(authentication, created.assignment.id),
        )
    }

    @GetMapping("/me/assignments/{assignmentId}/vocabulary", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getMyVocabularyHomeworkAssignment",
        summary = "Get my vocabulary homework session",
        description = "Returns the immutable personal vocabulary session reference for this assignment.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun getMyVocabularyHomeworkAssignment(
        authentication: JwtAuthenticationToken,
        @PathVariable assignmentId: UUID,
    ): StudentVocabularyAssignmentDetailResponse =
        store.studentVocabularyDetail(authentication, assignmentId)
}
