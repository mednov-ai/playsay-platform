package com.playsay.gateway.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import com.playsay.gateway.realtime.LessonChangedEvent
import com.playsay.gateway.realtime.LessonDeletedEvent
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*

@RestController
@Tag(name = "Schedule")
class ScheduledLessonController(
    private val store: ScheduledLessonStore,
    private val lifecycleService: ScheduledLessonLifecycleService,
    private val rescheduleService: ScheduledLessonRescheduleService,
) {
    @GetMapping("/schedule/lessons", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listScheduledLessons",
        summary = "List scheduled lessons",
        description = "Returns scheduled lessons. Teachers/admins see all, students see lessons where they are participants.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Scheduled lessons"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
        ],
    )
    fun list(authentication: JwtAuthenticationToken): List<ScheduledLessonResponse> =
        store.list(authentication)

    @GetMapping("/schedule/lessons/{lessonId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getScheduledLesson",
        summary = "Get scheduled lesson",
        description = "Returns a scheduled lesson visible to the current user.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Scheduled lesson"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson not found", content = [Content()]),
        ],
    )
    fun get(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): ScheduledLessonResponse =
        store.get(authentication, lessonId)

    @PostMapping(
        "/schedule/lessons",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createScheduledLesson",
        summary = "Create scheduled lesson",
        description = "Creates a calendar lesson. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "201", description = "Scheduled lesson created"),
            ApiResponse(responseCode = "400", description = "Invalid scheduled lesson payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage schedule", content = [Content()]),
        ],
    )
    fun create(
        authentication: JwtAuthenticationToken,
        @RequestBody request: ScheduledLessonRequest,
    ): ResponseEntity<ScheduledLessonResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(store.create(authentication, request))

    @PutMapping(
        "/schedule/lessons/{lessonId}",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "updateScheduledLesson",
        summary = "Update scheduled lesson",
        description = "Updates a calendar lesson. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Scheduled lesson updated"),
            ApiResponse(responseCode = "400", description = "Invalid scheduled lesson payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage schedule", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson not found", content = [Content()]),
        ],
    )
    fun update(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestBody request: ScheduledLessonRequest,
    ): ScheduledLessonResponse =
        store.update(authentication, lessonId, request)

    @PatchMapping(
        "/schedule/lessons/{lessonId}/schedule",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "rescheduleScheduledLesson",
        summary = "Reschedule one scheduled lesson",
        description = "Changes the date and time of only the selected lesson occurrence. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Scheduled lesson rescheduled"),
            ApiResponse(responseCode = "400", description = "Invalid scheduled interval", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage schedule", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson not found", content = [Content()]),
            ApiResponse(responseCode = "409", description = "Closed lesson cannot be rescheduled", content = [Content()]),
        ],
    )
    fun reschedule(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestBody request: ScheduledLessonScheduleUpdateRequest,
    ): ScheduledLessonResponse =
        rescheduleService.reschedule(authentication, lessonId, request)

    @DeleteMapping("/schedule/lessons/{lessonId}")
    @Operation(
        operationId = "deleteScheduledLesson",
        summary = "Delete scheduled lesson",
        description = "Deletes a calendar lesson. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "204", description = "Scheduled lesson deleted"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage schedule", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson not found", content = [Content()]),
        ],
    )
    fun delete(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): ResponseEntity<Void> {
        store.delete(authentication, lessonId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/schedule/lessons/{lessonId}/complete", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "completeScheduledLesson",
        summary = "Complete scheduled lesson",
        description = "Completes a calendar lesson and closes live access. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Scheduled lesson completed"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage schedule", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson not found", content = [Content()]),
        ],
    )
    fun complete(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): ScheduledLessonResponse =
        store.complete(authentication, lessonId)

    @PostMapping("/schedule/lessons/{lessonId}/start", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "startScheduledLesson",
        summary = "Start scheduled lesson",
        description = "Starts a calendar lesson and opens live access. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Scheduled lesson started"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage schedule", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson not found", content = [Content()]),
            ApiResponse(responseCode = "409", description = "Scheduled lesson cannot be started", content = [Content()]),
        ],
    )
    fun start(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): ScheduledLessonResponse =
        lifecycleService.start(authentication, lessonId)

    @PostMapping("/schedule/lessons/{lessonId}/participant-links", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "createScheduledLessonParticipantLinks",
        summary = "Create scheduled lesson participant links",
        description = "Returns per-participant lesson links. Teacher-managed students receive one-time magic links. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Scheduled lesson participant links"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage schedule", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson not found", content = [Content()]),
        ],
    )
    fun createParticipantLinks(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): ScheduledLessonParticipantLinksResponse =
        store.createParticipantLinks(authentication, lessonId)
}
