package com.playsay.gateway

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

private data class StoredCourse(
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

private data class StoredCourseLesson(
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

@Component
class CourseStore(
    private val jdbcClient: JdbcClient,
    private val userProfileStore: UserProfileStore,
) {
    @Transactional(readOnly = true)
    fun listCourses(authentication: JwtAuthenticationToken): List<CourseResponse> {
        val sql = if (authentication.canManageCourses()) {
            courseSelect() + " ORDER BY c.created_at DESC, c.title"
        } else {
            courseSelect("WHERE c.is_published = TRUE") + " ORDER BY c.created_at DESC, c.title"
        }

        return jdbcClient.sql(sql)
            .query(::mapCourse)
            .list()
            .map { course -> course.toResponse() }
    }

    @Transactional(readOnly = true)
    fun getCourse(authentication: JwtAuthenticationToken, courseId: UUID): CourseResponse =
        findVisibleCourse(authentication, courseId)?.toResponse()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found.")

    @Transactional
    fun createCourse(authentication: JwtAuthenticationToken, request: CourseRequest): CourseResponse {
        authentication.requireCourseManager()
        val creatorId = userProfileStore.currentUserId(authentication)
        val now = Instant.now()
        val id = UUID.randomUUID()
        val values = request.validated()

        jdbcClient.sql(
            """
            INSERT INTO course (
                id,
                title,
                description,
                level,
                language,
                created_by_user_id,
                is_published,
                created_at,
                updated_at
            ) VALUES (
                :id,
                :title,
                :description,
                :level,
                :language,
                :createdByUserId,
                :isPublished,
                :createdAt,
                :updatedAt
            )
            """.trimIndent(),
        )
            .param("id", id)
            .param("title", values.title)
            .param("description", values.description)
            .param("level", values.level)
            .param("language", values.language)
            .param("createdByUserId", creatorId)
            .param("isPublished", values.isPublished)
            .param("createdAt", now.toCourseOffsetDateTime())
            .param("updatedAt", now.toCourseOffsetDateTime())
            .update()

        return requireNotNull(findCourse(id)).toResponse()
    }

    @Transactional
    fun updateCourse(authentication: JwtAuthenticationToken, courseId: UUID, request: CourseRequest): CourseResponse {
        authentication.requireCourseManager()
        findCourse(courseId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found.")
        val values = request.validated()

        jdbcClient.sql(
            """
            UPDATE course
               SET title = :title,
                   description = :description,
                   level = :level,
                   language = :language,
                   is_published = :isPublished,
                   updated_at = :updatedAt
             WHERE id = :id
            """.trimIndent(),
        )
            .param("id", courseId)
            .param("title", values.title)
            .param("description", values.description)
            .param("level", values.level)
            .param("language", values.language)
            .param("isPublished", values.isPublished)
            .param("updatedAt", Instant.now().toCourseOffsetDateTime())
            .update()

        return requireNotNull(findCourse(courseId)).toResponse()
    }

    @Transactional
    fun deleteCourse(authentication: JwtAuthenticationToken, courseId: UUID) {
        authentication.requireCourseManager()
        jdbcClient.sql("DELETE FROM lesson_template WHERE course_id = :courseId")
            .param("courseId", courseId)
            .update()

        val deleted = jdbcClient.sql("DELETE FROM course WHERE id = :courseId")
            .param("courseId", courseId)
            .update()

        if (deleted == 0) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found.")
        }
    }

    @Transactional(readOnly = true)
    fun listCourseLessons(authentication: JwtAuthenticationToken, courseId: UUID): List<CourseLessonResponse> {
        findVisibleCourse(authentication, courseId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found.")

        return jdbcClient.sql(
            """
            SELECT id,
                   course_id,
                   title,
                   order_index,
                   planned_duration_min,
                   material_id,
                   material_title,
                   created_at,
                   updated_at
              FROM (
                SELECT lt.id,
                       lt.course_id,
                       lt.title,
                       lt.order_index,
                       lt.planned_duration_min,
                       lt.material_id,
                       lm.title AS material_title,
                       lt.created_at,
                       lt.updated_at
                  FROM lesson_template lt
                  LEFT JOIN lesson_material lm ON lm.id = lt.material_id
                 WHERE lt.course_id = :courseId
              ) lesson_template_with_material
             ORDER BY COALESCE(order_index, 2147483647), created_at, title
            """.trimIndent(),
        )
            .param("courseId", courseId)
            .query(::mapCourseLesson)
            .list()
            .map { lesson -> lesson.toResponse() }
    }

    @Transactional
    fun createCourseLesson(
        authentication: JwtAuthenticationToken,
        courseId: UUID,
        request: CourseLessonRequest,
    ): CourseLessonResponse {
        authentication.requireCourseManager()
        findCourse(courseId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found.")
        val values = request.validated()
        validateMaterialId(authentication, values.materialId)
        val now = Instant.now()
        val id = UUID.randomUUID()

        jdbcClient.sql(
            """
            INSERT INTO lesson_template (
                id,
                course_id,
                title,
                order_index,
                planned_duration_min,
                material_id,
                created_at,
                updated_at
            ) VALUES (
                :id,
                :courseId,
                :title,
                :orderIndex,
                :plannedDurationMin,
                :materialId,
                :createdAt,
                :updatedAt
            )
            """.trimIndent(),
        )
            .param("id", id)
            .param("courseId", courseId)
            .param("title", values.title)
            .param("orderIndex", values.orderIndex)
            .param("plannedDurationMin", values.plannedDurationMin)
            .param("materialId", values.materialId)
            .param("createdAt", now.toCourseOffsetDateTime())
            .param("updatedAt", now.toCourseOffsetDateTime())
            .update()

        return requireNotNull(findCourseLesson(courseId, id)).toResponse()
    }

    @Transactional
    fun updateCourseLesson(
        authentication: JwtAuthenticationToken,
        courseId: UUID,
        lessonId: UUID,
        request: CourseLessonRequest,
    ): CourseLessonResponse {
        authentication.requireCourseManager()
        findCourse(courseId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found.")
        val values = request.validated()
        validateMaterialId(authentication, values.materialId)
        val updated = jdbcClient.sql(
            """
            UPDATE lesson_template
               SET title = :title,
                   order_index = :orderIndex,
                   planned_duration_min = :plannedDurationMin,
                   material_id = :materialId,
                   updated_at = :updatedAt
             WHERE id = :lessonId
               AND course_id = :courseId
            """.trimIndent(),
        )
            .param("courseId", courseId)
            .param("lessonId", lessonId)
            .param("title", values.title)
            .param("orderIndex", values.orderIndex)
            .param("plannedDurationMin", values.plannedDurationMin)
            .param("materialId", values.materialId)
            .param("updatedAt", Instant.now().toCourseOffsetDateTime())
            .update()

        if (updated == 0) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Course lesson not found.")
        }

        return requireNotNull(findCourseLesson(courseId, lessonId)).toResponse()
    }

    @Transactional
    fun deleteCourseLesson(authentication: JwtAuthenticationToken, courseId: UUID, lessonId: UUID) {
        authentication.requireCourseManager()
        val deleted = jdbcClient.sql(
            """
            DELETE FROM lesson_template
             WHERE id = :lessonId
               AND course_id = :courseId
            """.trimIndent(),
        )
            .param("courseId", courseId)
            .param("lessonId", lessonId)
            .update()

        if (deleted == 0) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Course lesson not found.")
        }
    }

    private fun findVisibleCourse(authentication: JwtAuthenticationToken, courseId: UUID): StoredCourse? {
        val course = findCourse(courseId) ?: return null
        if (course.isPublished || authentication.canManageCourses()) {
            return course
        }
        return null
    }

    private fun findCourse(courseId: UUID): StoredCourse? =
        jdbcClient.sql(courseSelect("WHERE c.id = :courseId"))
            .param("courseId", courseId)
            .query(::mapCourse)
            .optional()
            .orElse(null)

    private fun findCourseLesson(courseId: UUID, lessonId: UUID): StoredCourseLesson? =
        jdbcClient.sql(
            """
            SELECT id,
                   course_id,
                   title,
                   order_index,
                   planned_duration_min,
                   material_id,
                   material_title,
                   created_at,
                   updated_at
              FROM (
                SELECT lt.id,
                       lt.course_id,
                       lt.title,
                       lt.order_index,
                       lt.planned_duration_min,
                       lt.material_id,
                       lm.title AS material_title,
                       lt.created_at,
                       lt.updated_at
                  FROM lesson_template lt
                  LEFT JOIN lesson_material lm ON lm.id = lt.material_id
                 WHERE lt.course_id = :courseId
                   AND lt.id = :lessonId
              ) lesson_template_with_material
            """.trimIndent(),
        )
            .param("courseId", courseId)
            .param("lessonId", lessonId)
            .query(::mapCourseLesson)
            .optional()
            .orElse(null)

    private fun courseSelect(whereClause: String = ""): String =
        """
        SELECT c.id,
               c.title,
               c.description,
               c.level,
               c.language,
               c.created_by_user_id,
               c.is_published,
               c.created_at,
               c.updated_at,
               COUNT(lt.id) AS lesson_count
          FROM course c
          LEFT JOIN lesson_template lt ON lt.course_id = c.id
          $whereClause
         GROUP BY c.id,
                  c.title,
                  c.description,
                  c.level,
                  c.language,
                  c.created_by_user_id,
                  c.is_published,
                  c.created_at,
                  c.updated_at
        """.trimIndent() +
            "\n"

    private fun validateMaterialId(authentication: JwtAuthenticationToken, materialId: UUID?) {
        if (materialId == null) {
            return
        }

        val params = mutableMapOf<String, Any?>("materialId" to materialId)
        val visibilityClause = if (authentication.isCourseAdmin()) {
            ""
        } else {
            params["currentUserId"] = userProfileStore.currentUserId(authentication)
            """
               AND (
                     owner_teacher_user_id = :currentUserId
                  OR (visibility = 'PUBLIC' AND status = 'PUBLISHED')
               )
            """.trimIndent()
        }

        val exists = jdbcClient.sql(
            """
            SELECT COUNT(*)
              FROM lesson_material
             WHERE id = :materialId
               AND status <> 'ARCHIVED'
             $visibilityClause
            """.trimIndent(),
        )
            .params(params)
            .query(Int::class.java)
            .single() > 0

        if (!exists) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "materialId does not exist.")
        }
    }
}

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

private data class ValidatedCourseRequest(
    val title: String,
    val description: String?,
    val level: String?,
    val language: String,
    val isPublished: Boolean,
)

private data class ValidatedCourseLessonRequest(
    val title: String,
    val orderIndex: Int?,
    val plannedDurationMin: Int?,
    val materialId: UUID?,
)

private fun CourseRequest.validated(): ValidatedCourseRequest =
    ValidatedCourseRequest(
        title = title.requiredClean("title", 160),
        description = description.optionalClean("description", 2_000),
        level = level.optionalClean("level", 16),
        language = language.requiredClean("language", 16),
        isPublished = isPublished,
    )

private fun CourseLessonRequest.validated(): ValidatedCourseLessonRequest {
    if (orderIndex != null && orderIndex < 0) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "orderIndex must be greater than or equal to 0.")
    }
    if (plannedDurationMin != null && plannedDurationMin !in 1..480) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "plannedDurationMin must be between 1 and 480.")
    }

    return ValidatedCourseLessonRequest(
        title = title.requiredClean("title", 160),
        orderIndex = orderIndex,
        plannedDurationMin = plannedDurationMin,
        materialId = materialId,
    )
}

private fun String.requiredClean(fieldName: String, maxLength: Int): String =
    optionalClean(fieldName, maxLength)
        ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$fieldName is required.")

private fun String?.optionalClean(fieldName: String, maxLength: Int): String? {
    val cleaned = this?.trim()?.takeIf { it.isNotEmpty() }
    if (cleaned != null && cleaned.length > maxLength) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$fieldName must be at most $maxLength characters.")
    }
    return cleaned
}

private fun JwtAuthenticationToken.requireCourseManager() {
    if (!canManageCourses()) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "TEACHER or ADMIN role is required.")
    }
}

private fun JwtAuthenticationToken.canManageCourses(): Boolean =
    authorities.any { authority -> authority.authority == "ROLE_TEACHER" || authority.authority == "ROLE_ADMIN" }

private fun JwtAuthenticationToken.isCourseAdmin(): Boolean =
    authorities.any { authority -> authority.authority == "ROLE_ADMIN" }

private fun StoredCourse.toResponse(): CourseResponse =
    CourseResponse(
        id = id,
        title = title,
        description = description,
        level = level,
        language = language,
        createdByUserId = createdByUserId,
        isPublished = isPublished,
        lessonCount = lessonCount,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun StoredCourseLesson.toResponse(): CourseLessonResponse =
    CourseLessonResponse(
        id = id,
        courseId = courseId,
        title = title,
        orderIndex = orderIndex,
        plannedDurationMin = plannedDurationMin,
        materialId = materialId,
        materialTitle = materialTitle,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun mapCourse(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): StoredCourse =
    StoredCourse(
        id = rs.getObject("id", UUID::class.java),
        title = rs.getString("title"),
        description = rs.getString("description"),
        level = rs.getString("level"),
        language = rs.getString("language"),
        createdByUserId = rs.getObject("created_by_user_id", UUID::class.java),
        isPublished = rs.getBoolean("is_published"),
        lessonCount = rs.getInt("lesson_count"),
        createdAt = rs.getCourseInstant("created_at"),
        updatedAt = rs.getCourseInstant("updated_at"),
    )

private fun mapCourseLesson(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): StoredCourseLesson =
    StoredCourseLesson(
        id = rs.getObject("id", UUID::class.java),
        courseId = rs.getObject("course_id", UUID::class.java),
        title = rs.getString("title"),
        orderIndex = rs.getNullableInt("order_index"),
        plannedDurationMin = rs.getNullableInt("planned_duration_min"),
        materialId = rs.getObject("material_id", UUID::class.java),
        materialTitle = rs.getString("material_title"),
        createdAt = rs.getCourseInstant("created_at"),
        updatedAt = rs.getCourseInstant("updated_at"),
    )

private fun ResultSet.getNullableInt(columnName: String): Int? {
    val value = getInt(columnName)
    return if (wasNull()) null else value
}

private fun ResultSet.getCourseInstant(columnName: String): Instant =
    getObject(columnName, OffsetDateTime::class.java).toInstant()

private fun Instant.toCourseOffsetDateTime(): OffsetDateTime =
    atOffset(ZoneOffset.UTC)
