package com.playsay.gateway.dto

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import com.playsay.gateway.realtime.LessonChangedEvent
import com.playsay.gateway.realtime.LessonDeletedEvent
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.simple.JdbcClient
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
import org.springframework.web.server.ResponseStatusException

data class ScheduledLessonRequest(
    val lessonTemplateId: UUID? = null,
    val materialId: UUID? = null,
    val scheduledStart: Instant? = null,
    val scheduledEnd: Instant? = null,
    @field:Schema(allowableValues = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    val status: String = "SCHEDULED",
    @field:Schema(allowableValues = ["INDIVIDUAL", "GROUP"])
    val type: String = "GROUP",
    val participantSubjects: List<String> = emptyList(),
)

data class ScheduledLessonParticipantResponse(
    val subject: String,
    val username: String?,
    val displayName: String?,
    val attendanceStatus: String?,
)

data class ScheduledLessonResponse(
    val id: UUID,
    val lessonTemplateId: UUID?,
    val materialId: UUID?,
    val materialTitle: String?,
    val courseId: UUID?,
    val courseTitle: String?,
    val lessonTitle: String?,
    val teacherSubject: String?,
    val teacherName: String?,
    val scheduledStart: Instant?,
    val scheduledEnd: Instant?,
    val status: String,
    val type: String,
    val livekitRoomName: String?,
    val participants: List<ScheduledLessonParticipantResponse>,
    val createdAt: Instant,
    val updatedAt: Instant,
)
