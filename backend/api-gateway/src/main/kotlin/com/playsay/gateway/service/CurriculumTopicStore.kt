package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.playsay.gateway.dto.CurriculumTopicRequest
import com.playsay.gateway.dto.CurriculumTopicResponse
import com.playsay.gateway.entity.CurriculumTopicEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.CourseRepo
import com.playsay.gateway.repo.CourseSummaryRow
import com.playsay.gateway.repo.CurriculumTopicRepo
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class CurriculumTopicStore(
    private val courseRepo: CourseRepo,
    private val curriculumTopicRepo: CurriculumTopicRepo,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    @Transactional(readOnly = true)
    fun listTopics(authentication: JwtAuthenticationToken, courseId: UUID): List<CurriculumTopicResponse> {
        findVisibleCourse(authentication, courseId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND)

        return curriculumTopicRepo.findByCourseIdOrdered(courseId)
            .map { topic -> topic.toResponse(objectMapper) }
    }

    @Transactional
    fun createTopic(
        authentication: JwtAuthenticationToken,
        courseId: UUID,
        request: CurriculumTopicRequest,
    ): CurriculumTopicResponse {
        authentication.requireCourseManager()
        findCourse(courseId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND)
        val values = request.validated()
        val now = Instant.now()

        val topic = curriculumTopicRepo.save(
            CurriculumTopicEntity(
                id = UUID.randomUUID(),
                courseId = courseId,
                title = values.title,
                description = values.description,
                orderIndex = values.orderIndex,
                tagSlugs = objectMapper.writeValueAsString(values.tagSlugs),
                createdAt = now,
                updatedAt = now,
            ),
        )

        return topic.toResponse(objectMapper)
    }

    @Transactional
    fun updateTopic(
        authentication: JwtAuthenticationToken,
        courseId: UUID,
        topicId: UUID,
        request: CurriculumTopicRequest,
    ): CurriculumTopicResponse {
        authentication.requireCourseManager()
        findCourse(courseId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND)
        val topic = curriculumTopicRepo.findByIdAndCourseId(topicId, courseId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_LESSON_NOT_FOUND)
        val values = request.validated()

        topic.title = values.title
        topic.description = values.description
        topic.orderIndex = values.orderIndex
        topic.tagSlugs = objectMapper.writeValueAsString(values.tagSlugs)
        topic.updatedAt = Instant.now()
        curriculumTopicRepo.save(topic)

        return topic.toResponse(objectMapper)
    }

    @Transactional
    fun deleteTopic(authentication: JwtAuthenticationToken, courseId: UUID, topicId: UUID) {
        authentication.requireCourseManager()
        val deleted = curriculumTopicRepo.deleteByIdAndCourseId(topicId, courseId)

        if (deleted == 0L) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_LESSON_NOT_FOUND)
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
}

private data class ValidatedCurriculumTopicRequest(
    val title: String,
    val description: String?,
    val orderIndex: Int?,
    val tagSlugs: List<String>,
)

private fun CurriculumTopicRequest.validated(): ValidatedCurriculumTopicRequest {
    if (orderIndex != null && orderIndex < 0) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.ORDER_INDEX_NEGATIVE)
    }
    return ValidatedCurriculumTopicRequest(
        title = title.requiredClean("title", 160),
        description = description.optionalClean("description", 2_000),
        orderIndex = orderIndex,
        tagSlugs = tagSlugs.cleanTagSlugs("tagSlugs", 24),
    )
}

private fun List<String>.cleanTagSlugs(fieldName: String, maxItems: Int): List<String> {
    if (size > maxItems) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_TOO_LONG, fieldName, maxItems)
    }
    val seen = linkedSetOf<String>()
    forEach { raw ->
        val normalized = raw.trim()
            .removePrefix("#")
            .lowercase()
            .replace(Regex("[^a-z0-9-]+"), "-")
            .replace(Regex("-+"), "-")
            .trim('-')
            .take(40)
        if (normalized.isNotEmpty()) {
            seen.add(normalized)
        }
    }
    return seen.toList()
}

private fun String.requiredClean(fieldName: String, maxLength: Int): String =
    optionalClean(fieldName, maxLength)
        ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, fieldName)

private fun String?.optionalClean(fieldName: String, maxLength: Int): String? {
    val cleaned = this?.trim()?.takeIf { it.isNotEmpty() }
    if (cleaned != null && cleaned.length > maxLength) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_TOO_LONG, fieldName, maxLength)
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

private fun CurriculumTopicEntity.toResponse(objectMapper: ObjectMapper): CurriculumTopicResponse =
    CurriculumTopicResponse(
        id = id,
        courseId = courseId,
        title = title,
        description = description,
        orderIndex = orderIndex,
        tagSlugs = runCatching { objectMapper.readValue<List<String>>(tagSlugs) }.getOrDefault(emptyList()),
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
