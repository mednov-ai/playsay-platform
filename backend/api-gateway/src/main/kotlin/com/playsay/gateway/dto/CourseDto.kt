package com.playsay.gateway.dto

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
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

data class CourseRequest(
    @field:Schema(maxLength = 160)
    val title: String,
    @field:Schema(maxLength = 2_000, nullable = true)
    val description: String? = null,
    @field:Schema(maxLength = 16, nullable = true)
    val level: String? = null,
    @field:Schema(maxLength = 16)
    val language: String = "en",
    val isPublished: Boolean = false,
)

data class CourseResponse(
    val id: UUID,
    val title: String,
    val description: String?,
    val level: String?,
    val language: String,
    val createdByUserId: UUID?,
    val isPublished: Boolean,
    val lessonCount: Int,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class CourseLessonRequest(
    @field:Schema(maxLength = 160)
    val title: String,
    @field:Schema(nullable = true)
    val orderIndex: Int? = null,
    @field:Schema(nullable = true)
    val plannedDurationMin: Int? = null,
    @field:Schema(nullable = true)
    val materialId: UUID? = null,
)

data class CourseLessonResponse(
    val id: UUID,
    val courseId: UUID,
    val title: String,
    val orderIndex: Int?,
    val plannedDurationMin: Int?,
    val materialId: UUID?,
    val materialTitle: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)
