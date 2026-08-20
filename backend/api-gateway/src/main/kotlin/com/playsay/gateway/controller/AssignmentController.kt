package com.playsay.gateway.controller

import com.playsay.gateway.dto.AssignmentSubmissionResponse
import com.playsay.gateway.dto.AssignmentSummaryResponse
import com.playsay.gateway.dto.HomeworkAssignmentRequest
import com.playsay.gateway.dto.LessonHomeworkRequest
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.StudentAssignmentDetailResponse
import com.playsay.gateway.dto.TeacherAssignmentDetailResponse
import com.playsay.gateway.dto.TeacherAssignmentSubmissionDetailResponse
import com.playsay.gateway.service.assignment.AssignmentStore
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Assignments")
class AssignmentController(
    private val store: AssignmentStore,
) {
    @PostMapping(
        "/assignments",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createHomeworkAssignment",
        summary = "Create homework assignment",
        description = "Creates a material-based homework assignment for selected students. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "201", description = "Homework assignment created"),
            ApiResponse(responseCode = "400", description = "Invalid assignment payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot create assignments", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material not found", content = [Content()]),
        ],
    )
    fun createHomeworkAssignment(
        authentication: JwtAuthenticationToken,
        @RequestBody request: HomeworkAssignmentRequest,
    ): ResponseEntity<TeacherAssignmentDetailResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(store.createHomework(authentication, request))

    @PostMapping(
        "/schedule/lessons/{lessonId}/homework",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createHomeworkFromScheduledLesson",
        summary = "Carry scheduled lesson material into homework",
        description = "Creates or updates a homework assignment from a scheduled lesson material and participants. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "201", description = "Homework assignment created"),
            ApiResponse(responseCode = "400", description = "Invalid homework payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot create assignments", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
        ],
    )
    fun createHomeworkFromScheduledLesson(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestBody request: LessonHomeworkRequest,
    ): ResponseEntity<TeacherAssignmentDetailResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(store.createHomeworkFromLesson(authentication, lessonId, request))

    @GetMapping("/assignments", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listHomeworkAssignments",
        summary = "List homework assignments",
        description = "Lists homework assignments visible to the current teacher or administrator.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun listHomeworkAssignments(authentication: JwtAuthenticationToken): List<AssignmentSummaryResponse> =
        store.listTeacherAssignments(authentication)

    @GetMapping("/assignments/{assignmentId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getHomeworkAssignment",
        summary = "Get homework assignment progress",
        description = "Returns recipients and current score/error progress for a homework assignment.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun getHomeworkAssignment(
        authentication: JwtAuthenticationToken,
        @PathVariable assignmentId: UUID,
    ): TeacherAssignmentDetailResponse =
        store.teacherDetail(authentication, assignmentId)

    @GetMapping(
        "/assignments/{assignmentId}/submissions/{submissionId}",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "getSubmittedHomeworkResult",
        summary = "Get a submitted homework result",
        description = "Returns submitted material work to the assignment owner, an administrator, or an active delegate.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Submitted homework result"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Assignment or submitted result not found", content = [Content()]),
        ],
    )
    fun getSubmittedHomeworkResult(
        authentication: JwtAuthenticationToken,
        @PathVariable assignmentId: UUID,
        @PathVariable submissionId: UUID,
    ): TeacherAssignmentSubmissionDetailResponse =
        store.teacherSubmissionDetail(authentication, assignmentId, submissionId)

    @GetMapping("/me/assignments", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listMyHomeworkAssignments",
        summary = "List my homework assignments",
        description = "Lists homework assignments assigned to the current student.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun listMyHomeworkAssignments(authentication: JwtAuthenticationToken): List<AssignmentSummaryResponse> =
        store.listStudentAssignments(authentication)

    @GetMapping("/me/assignments/{assignmentId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getMyHomeworkAssignment",
        summary = "Get my homework assignment",
        description = "Returns the assigned material and current answer snapshot for the current student.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun getMyHomeworkAssignment(
        authentication: JwtAuthenticationToken,
        @PathVariable assignmentId: UUID,
    ): StudentAssignmentDetailResponse =
        store.studentDetail(authentication, assignmentId)

    @GetMapping("/me/assignments/{assignmentId}/material", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getMyHomeworkAssignmentMaterial",
        summary = "Get my homework material",
        description = "Returns the material attached to a homework assignment assigned to the current student.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun getMyHomeworkAssignmentMaterial(
        authentication: JwtAuthenticationToken,
        @PathVariable assignmentId: UUID,
    ): LessonMaterialResponse =
        store.studentMaterial(authentication, assignmentId)

    @GetMapping("/me/assignments/{assignmentId}/submission", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getMyHomeworkAssignmentSubmission",
        summary = "Get my homework answer snapshot",
        description = "Returns the current student's saved answers for a homework assignment.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun getMyHomeworkAssignmentSubmission(
        authentication: JwtAuthenticationToken,
        @PathVariable assignmentId: UUID,
    ): AssignmentSubmissionResponse =
        store.studentSubmission(authentication, assignmentId)

    @PutMapping(
        "/me/assignments/{assignmentId}/submission",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "saveMyHomeworkAssignmentSubmission",
        summary = "Save my homework answer snapshot",
        description = "Creates or updates the current student's answers and automatic score/error snapshot for homework.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun saveMyHomeworkAssignmentSubmission(
        authentication: JwtAuthenticationToken,
        @PathVariable assignmentId: UUID,
        @RequestBody request: MaterialSubmissionRequest,
    ): AssignmentSubmissionResponse =
        store.saveStudentSubmission(authentication, assignmentId, request)
}
