package com.playsay.gateway.service

import com.playsay.gateway.dto.CourseLessonRequest
import com.playsay.gateway.dto.CourseLessonResponse
import com.playsay.gateway.dto.CourseRequest
import com.playsay.gateway.dto.CourseResponse
import com.playsay.gateway.entity.CourseEntity
import com.playsay.gateway.entity.LessonTemplateEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.CourseLessonRow
import com.playsay.gateway.repo.CourseRepo
import com.playsay.gateway.repo.CourseSummaryRow
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonTemplateRepo
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class CourseStore(
    private val courseRepo: CourseRepo,
    private val lessonTemplateRepo: LessonTemplateRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val userProfileStore: UserProfileStore,
) {
    @Transactional(readOnly = true)
    fun listCourses(authentication: JwtAuthenticationToken): List<CourseResponse> {
        val rows = if (authentication.canManageCourses()) {
            courseRepo.findCourseSummaries()
        } else {
            courseRepo.findPublishedCourseSummaries()
        }

        return rows
            .map { course -> course.toResponse() }
    }

    @Transactional(readOnly = true)
    fun getCourse(authentication: JwtAuthenticationToken, courseId: UUID): CourseResponse =
        findVisibleCourse(authentication, courseId)?.toResponse()
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND)

    @Transactional
    fun createCourse(authentication: JwtAuthenticationToken, request: CourseRequest): CourseResponse {
        authentication.requireCourseManager()
        val creatorId = userProfileStore.currentUserId(authentication)
        val now = Instant.now()
        val values = request.validated()

        val course = courseRepo.save(
            CourseEntity(
                id = UUID.randomUUID(),
                title = values.title,
                description = values.description,
                level = values.level,
                language = values.language,
                createdByUserId = creatorId,
                isPublished = values.isPublished,
                createdAt = now,
                updatedAt = now,
            ),
        )

        return requireNotNull(findCourse(course.id)).toResponse()
    }

    @Transactional
    fun updateCourse(authentication: JwtAuthenticationToken, courseId: UUID, request: CourseRequest): CourseResponse {
        authentication.requireCourseManager()
        val course = courseRepo.findById(courseId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND)
        val values = request.validated()

        course.title = values.title
        course.description = values.description
        course.level = values.level
        course.language = values.language
        course.isPublished = values.isPublished
        course.updatedAt = Instant.now()
        courseRepo.save(course)

        return requireNotNull(findCourse(courseId)).toResponse()
    }

    @Transactional
    fun deleteCourse(authentication: JwtAuthenticationToken, courseId: UUID) {
        authentication.requireCourseManager()
        if (!courseRepo.existsById(courseId)) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND)
        }

        lessonTemplateRepo.deleteByCourseId(courseId)
        courseRepo.deleteById(courseId)
    }

    @Transactional(readOnly = true)
    fun listCourseLessons(authentication: JwtAuthenticationToken, courseId: UUID): List<CourseLessonResponse> {
        findVisibleCourse(authentication, courseId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND)

        return lessonTemplateRepo.findLessonRowsByCourseId(courseId)
            .map { lesson -> lesson.toResponse() }
    }

    @Transactional
    fun createCourseLesson(
        authentication: JwtAuthenticationToken,
        courseId: UUID,
        request: CourseLessonRequest,
    ): CourseLessonResponse {
        authentication.requireCourseManager()
        findCourse(courseId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND)
        val values = request.validated()
        validateMaterialId(authentication, values.materialId)
        val now = Instant.now()

        val lesson = lessonTemplateRepo.save(
            LessonTemplateEntity(
                id = UUID.randomUUID(),
                courseId = courseId,
                title = values.title,
                orderIndex = values.orderIndex,
                plannedDurationMin = values.plannedDurationMin,
                materialId = values.materialId,
                createdAt = now,
                updatedAt = now,
            ),
        )

        return requireNotNull(findCourseLesson(courseId, lesson.id)).toResponse()
    }

    @Transactional
    fun updateCourseLesson(
        authentication: JwtAuthenticationToken,
        courseId: UUID,
        lessonId: UUID,
        request: CourseLessonRequest,
    ): CourseLessonResponse {
        authentication.requireCourseManager()
        findCourse(courseId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND)
        val values = request.validated()
        validateMaterialId(authentication, values.materialId)
        val lesson = lessonTemplateRepo.findByIdAndCourseId(lessonId, courseId)
            ?: throw ProjectResponseException(HttpStatus.NOT_FOUND, "Course lesson not found.")

        lesson.title = values.title
        lesson.orderIndex = values.orderIndex
        lesson.plannedDurationMin = values.plannedDurationMin
        lesson.materialId = values.materialId
        lesson.updatedAt = Instant.now()
        lessonTemplateRepo.save(lesson)

        return requireNotNull(findCourseLesson(courseId, lessonId)).toResponse()
    }

    @Transactional
    fun deleteCourseLesson(authentication: JwtAuthenticationToken, courseId: UUID, lessonId: UUID) {
        authentication.requireCourseManager()
        val deleted = lessonTemplateRepo.deleteByIdAndCourseId(lessonId, courseId)

        if (deleted == 0L) {
            throw ProjectResponseException(HttpStatus.NOT_FOUND, "Course lesson not found.")
        }
    }

    private fun findVisibleCourse(authentication: JwtAuthenticationToken, courseId: UUID): CourseSummaryRow? {
        val course = findCourse(courseId) ?: return null
        if (course.course.isPublished || authentication.canManageCourses()) {
            return course
        }
        return null
    }

    private fun findCourse(courseId: UUID): CourseSummaryRow? =
        courseRepo.findCourseSummaryById(courseId)

    private fun findCourseLesson(courseId: UUID, lessonId: UUID): CourseLessonRow? =
        lessonTemplateRepo.findLessonRowByCourseIdAndId(courseId, lessonId)

    private fun validateMaterialId(authentication: JwtAuthenticationToken, materialId: UUID?) {
        if (materialId == null) {
            return
        }

        val exists = if (authentication.isCourseAdmin()) {
            lessonMaterialRepo.existsByIdAndStatusNot(materialId, MetaData.MaterialStatuses.ARCHIVED)
        } else {
            lessonMaterialRepo.countVisibleActiveForUser(
                materialId = materialId,
                currentUserId = userProfileStore.currentUserId(authentication),
                archivedStatus = MetaData.MaterialStatuses.ARCHIVED,
                publicVisibility = MetaData.MaterialVisibility.PUBLIC,
                publishedStatus = MetaData.MaterialStatuses.PUBLISHED,
            ) > 0
        }

        if (!exists) {
            throw ProjectResponseException(HttpStatus.BAD_REQUEST, "materialId does not exist.")
        }
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
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "orderIndex must be greater than or equal to 0.")
    }
    if (plannedDurationMin != null && plannedDurationMin !in 1..480) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "plannedDurationMin must be between 1 and 480.")
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
        ?: throw ProjectResponseException(HttpStatus.BAD_REQUEST, "$fieldName is required.")

private fun String?.optionalClean(fieldName: String, maxLength: Int): String? {
    val cleaned = this?.trim()?.takeIf { it.isNotEmpty() }
    if (cleaned != null && cleaned.length > maxLength) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "$fieldName must be at most $maxLength characters.")
    }
    return cleaned
}

private fun JwtAuthenticationToken.requireCourseManager() {
    if (!canManageCourses()) {
        throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
    }
}

private fun JwtAuthenticationToken.canManageCourses(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN }

private fun JwtAuthenticationToken.isCourseAdmin(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }

private fun CourseSummaryRow.toResponse(): CourseResponse =
    CourseResponse(
        id = course.id,
        title = course.title,
        description = course.description,
        level = course.level,
        language = course.language,
        createdByUserId = course.createdByUserId,
        isPublished = course.isPublished,
        lessonCount = lessonCount.toInt(),
        createdAt = course.createdAt,
        updatedAt = course.updatedAt,
    )

private fun CourseLessonRow.toResponse(): CourseLessonResponse =
    CourseLessonResponse(
        id = id,
        courseId = requireNotNull(courseId),
        title = title,
        orderIndex = orderIndex,
        plannedDurationMin = plannedDurationMin,
        materialId = materialId,
        materialTitle = materialTitle,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
