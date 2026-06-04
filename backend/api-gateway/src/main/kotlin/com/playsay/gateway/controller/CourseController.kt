package com.playsay.gateway.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*

@RestController
@Tag(name = "Courses")
class CourseController(
    private val store: CourseStore,
) {
    @GetMapping("/courses", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listCourses",
        summary = "List courses",
        description = "Returns published courses for students and all courses for teachers/admins.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Courses"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
        ],
    )
    fun list(authentication: JwtAuthenticationToken): List<CourseResponse> =
        store.listCourses(authentication)

    @GetMapping("/courses/{courseId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getCourse",
        summary = "Get course",
        description = "Returns a single course. Unpublished courses are visible only to teachers/admins.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Course"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Course not found", content = [Content()]),
        ],
    )
    fun get(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
    ): CourseResponse =
        store.getCourse(authentication, courseId)

    @PostMapping(
        "/courses",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createCourse",
        summary = "Create course",
        description = "Creates a course. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "201", description = "Course created"),
            ApiResponse(responseCode = "400", description = "Invalid course payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage courses", content = [Content()]),
        ],
    )
    fun create(
        authentication: JwtAuthenticationToken,
        @RequestBody request: CourseRequest,
    ): ResponseEntity<CourseResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(store.createCourse(authentication, request))

    @PutMapping(
        "/courses/{courseId}",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "updateCourse",
        summary = "Update course",
        description = "Updates a course. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Course updated"),
            ApiResponse(responseCode = "400", description = "Invalid course payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage courses", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Course not found", content = [Content()]),
        ],
    )
    fun update(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
        @RequestBody request: CourseRequest,
    ): CourseResponse =
        store.updateCourse(authentication, courseId, request)

    @DeleteMapping("/courses/{courseId}")
    @Operation(
        operationId = "deleteCourse",
        summary = "Delete course",
        description = "Deletes a course and its draft lesson templates. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "204", description = "Course deleted"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage courses", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Course not found", content = [Content()]),
        ],
    )
    fun delete(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
    ): ResponseEntity<Void> {
        store.deleteCourse(authentication, courseId)
        return ResponseEntity.noContent().build()
    }

    @GetMapping("/courses/{courseId}/lessons", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listCourseLessons",
        summary = "List course lessons",
        description = "Returns lesson templates inside a course. Unpublished courses are visible only to teachers/admins.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Course lessons"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Course not found", content = [Content()]),
        ],
    )
    fun listLessons(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
    ): List<CourseLessonResponse> =
        store.listCourseLessons(authentication, courseId)

    @PostMapping(
        "/courses/{courseId}/lessons",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createCourseLesson",
        summary = "Create course lesson",
        description = "Creates a lesson template inside a course. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "201", description = "Course lesson created"),
            ApiResponse(responseCode = "400", description = "Invalid course lesson payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage courses", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Course not found", content = [Content()]),
        ],
    )
    fun createLesson(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
        @RequestBody request: CourseLessonRequest,
    ): ResponseEntity<CourseLessonResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(store.createCourseLesson(authentication, courseId, request))

    @PutMapping(
        "/courses/{courseId}/lessons/{lessonId}",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "updateCourseLesson",
        summary = "Update course lesson",
        description = "Updates a lesson template inside a course. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Course lesson updated"),
            ApiResponse(responseCode = "400", description = "Invalid course lesson payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage courses", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Course lesson not found", content = [Content()]),
        ],
    )
    fun updateLesson(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
        @PathVariable lessonId: UUID,
        @RequestBody request: CourseLessonRequest,
    ): CourseLessonResponse =
        store.updateCourseLesson(authentication, courseId, lessonId, request)

    @PutMapping(
        "/courses/{courseId}/lessons/{lessonId}/cards",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "replaceCourseLessonCards",
        summary = "Replace course lesson cards",
        description = "Replaces the ordered reusable card list for a lesson template. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun replaceLessonCards(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
        @PathVariable lessonId: UUID,
        @RequestBody request: LessonTemplateCardsRequest,
    ): CourseLessonResponse =
        store.replaceLessonCards(authentication, courseId, lessonId, request)

    @DeleteMapping("/courses/{courseId}/lessons/{lessonId}")
    @Operation(
        operationId = "deleteCourseLesson",
        summary = "Delete course lesson",
        description = "Deletes a lesson template inside a course. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "204", description = "Course lesson deleted"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage courses", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Course lesson not found", content = [Content()]),
        ],
    )
    fun deleteLesson(
        authentication: JwtAuthenticationToken,
        @PathVariable courseId: UUID,
        @PathVariable lessonId: UUID,
    ): ResponseEntity<Void> {
        store.deleteCourseLesson(authentication, courseId, lessonId)
        return ResponseEntity.noContent().build()
    }
}
