package com.playsay.gateway.service

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
import com.playsay.gateway.repo.LegacyJdbcDataRepo
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
import com.playsay.gateway.dto.*
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.error.ProjectResponseException

private data class StoredScheduledLesson(
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
    val createdAt: Instant,
    val updatedAt: Instant,
)

private data class StoredLessonParticipant(
    val lessonId: UUID,
    val userId: UUID,
    val subject: String,
    val username: String?,
    val displayName: String?,
    val attendanceStatus: String?,
)

@Component
class ScheduledLessonStore(
    private val dataRepo: LegacyJdbcDataRepo,
    private val userProfileStore: UserProfileStore,
    private val eventPublisher: ApplicationEventPublisher,
) {
    @Transactional(readOnly = true)
    fun list(authentication: JwtAuthenticationToken): List<ScheduledLessonResponse> {
        val params = mutableMapOf<String, Any?>()
        val whereClause = if (authentication.canManageSchedule()) {
            ""
        } else {
            params["subject"] = authentication.token.subject
            params["now"] = Instant.now().toScheduleOffsetDateTime()
            """
             WHERE EXISTS (
                   SELECT 1
                     FROM lesson_participant lp_filter
                     JOIN app_user student_filter ON student_filter.id = lp_filter.student_user_id
                    WHERE lp_filter.lesson_id = l.id
                      AND student_filter.keycloak_subject = :subject
             )
               AND l.status NOT IN ('CANCELLED', 'COMPLETED')
               AND (l.scheduled_end IS NULL OR l.scheduled_end > :now)
            """.trimIndent()
        }

        return dataRepo.sql(lessonSelect(whereClause))
            .params(params)
            .query(::mapScheduledLesson)
            .list()
            .withParticipants()
    }

    @Transactional(readOnly = true)
    fun get(authentication: JwtAuthenticationToken, lessonId: UUID): ScheduledLessonResponse =
        findVisible(authentication, lessonId)?.withParticipants()
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)

    @Transactional
    fun create(authentication: JwtAuthenticationToken, request: ScheduledLessonRequest): ScheduledLessonResponse {
        authentication.requireScheduleManager()
        val teacherUserId = userProfileStore.currentUserId(authentication)
        val values = request.validated()
        validateLessonTemplate(values.lessonTemplateId)
        validateMaterialId(authentication, values.materialId)
        val participantIds = participantIds(values.participantSubjects)
        val id = UUID.randomUUID()
        val now = Instant.now()

        dataRepo.sql(
            """
            INSERT INTO lesson (
                id,
                lesson_template_id,
                material_id,
                teacher_user_id,
                scheduled_start,
                scheduled_end,
                status,
                type,
                livekit_room_name,
                created_at,
                updated_at
            ) VALUES (
                :id,
                :lessonTemplateId,
                :materialId,
                :teacherUserId,
                :scheduledStart,
                :scheduledEnd,
                :status,
                :type,
                :livekitRoomName,
                :createdAt,
                :updatedAt
            )
            """.trimIndent(),
        )
            .param("id", id)
            .param("lessonTemplateId", values.lessonTemplateId)
            .param("materialId", values.materialId)
            .param("teacherUserId", teacherUserId)
            .param("scheduledStart", values.scheduledStart?.toScheduleOffsetDateTime())
            .param("scheduledEnd", values.scheduledEnd?.toScheduleOffsetDateTime())
            .param("status", values.status)
            .param("type", values.type)
            .param("livekitRoomName", "lesson-$id")
            .param("createdAt", now.toScheduleOffsetDateTime())
            .param("updatedAt", now.toScheduleOffsetDateTime())
            .update()

        replaceParticipants(id, participantIds)
        val created = requireNotNull(find(id)).withParticipants()
        eventPublisher.publishEvent(LessonChangedEvent(created))
        return created
    }

    @Transactional
    fun update(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: ScheduledLessonRequest,
    ): ScheduledLessonResponse {
        authentication.requireScheduleManager()
        find(lessonId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val values = request.validated()
        validateLessonTemplate(values.lessonTemplateId)
        validateMaterialId(authentication, values.materialId)
        val participantIds = participantIds(values.participantSubjects)

        dataRepo.sql(
            """
            UPDATE lesson
               SET lesson_template_id = :lessonTemplateId,
                   material_id = :materialId,
                   scheduled_start = :scheduledStart,
                   scheduled_end = :scheduledEnd,
                   status = :status,
                   type = :type,
                   updated_at = :updatedAt
             WHERE id = :id
            """.trimIndent(),
        )
            .param("id", lessonId)
            .param("lessonTemplateId", values.lessonTemplateId)
            .param("materialId", values.materialId)
            .param("scheduledStart", values.scheduledStart?.toScheduleOffsetDateTime())
            .param("scheduledEnd", values.scheduledEnd?.toScheduleOffsetDateTime())
            .param("status", values.status)
            .param("type", values.type)
            .param("updatedAt", Instant.now().toScheduleOffsetDateTime())
            .update()

        replaceParticipants(lessonId, participantIds)
        val updated = requireNotNull(find(lessonId)).withParticipants()
        eventPublisher.publishEvent(LessonChangedEvent(updated))
        return updated
    }

    @Transactional
    fun delete(authentication: JwtAuthenticationToken, lessonId: UUID) {
        authentication.requireScheduleManager()
        val deleted = dataRepo.sql("DELETE FROM lesson WHERE id = :lessonId")
            .param("lessonId", lessonId)
            .update()

        if (deleted == 0) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }

        eventPublisher.publishEvent(LessonDeletedEvent(lessonId))
    }

    private fun findVisible(authentication: JwtAuthenticationToken, lessonId: UUID): StoredScheduledLesson? {
        val lesson = find(lessonId) ?: return null
        if (authentication.canManageSchedule()) {
            return lesson
        }

        if (!lesson.isVisibleToParticipant(Instant.now())) {
            return null
        }

        val isParticipant = dataRepo.sql(
            """
            SELECT COUNT(*)
              FROM lesson_participant lp
              JOIN app_user student ON student.id = lp.student_user_id
             WHERE lp.lesson_id = :lessonId
               AND student.keycloak_subject = :subject
            """.trimIndent(),
        )
            .param("lessonId", lessonId)
            .param("subject", authentication.token.subject)
            .query(Int::class.java)
            .single() > 0

        return lesson.takeIf { isParticipant }
    }

    private fun find(lessonId: UUID): StoredScheduledLesson? =
        dataRepo.sql(lessonSelect("WHERE l.id = :lessonId"))
            .param("lessonId", lessonId)
            .query(::mapScheduledLesson)
            .optional()
            .orElse(null)

    private fun List<StoredScheduledLesson>.withParticipants(): List<ScheduledLessonResponse> {
        if (isEmpty()) {
            return emptyList()
        }

        val participantsByLesson = participantsFor(map { lesson -> lesson.id }).groupBy { participant -> participant.lessonId }
        return map { lesson -> lesson.toResponse(participantsByLesson[lesson.id].orEmpty()) }
    }

    private fun StoredScheduledLesson.withParticipants(): ScheduledLessonResponse =
        toResponse(participantsFor(listOf(id)))

    private fun participantsFor(lessonIds: List<UUID>): List<StoredLessonParticipant> {
        if (lessonIds.isEmpty()) {
            return emptyList()
        }

        return dataRepo.sql(
            """
            SELECT lp.lesson_id,
                   lp.student_user_id,
                   student.keycloak_subject,
                   student.username,
                   student.display_name,
                   lp.attendance_status
              FROM lesson_participant lp
              JOIN app_user student ON student.id = lp.student_user_id
             WHERE lp.lesson_id IN (:lessonIds)
             ORDER BY COALESCE(student.display_name, student.username, student.keycloak_subject)
            """.trimIndent(),
        )
            .param("lessonIds", lessonIds)
            .query(::mapLessonParticipant)
            .list()
    }

    private fun participantIds(subjects: List<String>): List<UUID> {
        val cleanedSubjects = subjects.mapNotNull { subject -> subject.trim().takeIf { it.isNotEmpty() } }.distinct()
        if (cleanedSubjects.isEmpty()) {
            return emptyList()
        }

        val users = dataRepo.sql(
            """
            SELECT id, keycloak_subject
              FROM app_user
             WHERE keycloak_subject IN (:subjects)
            """.trimIndent(),
        )
            .param("subjects", cleanedSubjects)
            .query { rs, _ -> rs.getString("keycloak_subject") to rs.getObject("id", UUID::class.java) }
            .list()
            .toMap()

        val missingSubjects = cleanedSubjects.filter { subject -> subject !in users }
        if (missingSubjects.isNotEmpty()) {
            throw ProjectResponseException(HttpStatus.BAD_REQUEST, "Unknown participant subject: ${missingSubjects.first()}.")
        }

        return cleanedSubjects.map { subject -> requireNotNull(users[subject]) }
    }

    private fun replaceParticipants(lessonId: UUID, participantIds: List<UUID>) {
        dataRepo.sql("DELETE FROM lesson_participant WHERE lesson_id = :lessonId")
            .param("lessonId", lessonId)
            .update()

        participantIds.forEach { participantId ->
            dataRepo.sql(
                """
                INSERT INTO lesson_participant (
                    id,
                    lesson_id,
                    student_user_id,
                    attendance_status
                ) VALUES (
                    :id,
                    :lessonId,
                    :studentUserId,
                    :attendanceStatus
                )
                """.trimIndent(),
            )
                .param("id", UUID.randomUUID())
                .param("lessonId", lessonId)
                .param("studentUserId", participantId)
                .param("attendanceStatus", "PLANNED")
                .update()
        }
    }

    private fun validateLessonTemplate(lessonTemplateId: UUID?) {
        if (lessonTemplateId == null) {
            return
        }

        val exists = dataRepo.sql("SELECT COUNT(*) FROM lesson_template WHERE id = :lessonTemplateId")
            .param("lessonTemplateId", lessonTemplateId)
            .query(Int::class.java)
            .single() > 0

        if (!exists) {
            throw ProjectResponseException(HttpStatus.BAD_REQUEST, "lessonTemplateId does not exist.")
        }
    }

    private fun validateMaterialId(authentication: JwtAuthenticationToken, materialId: UUID?) {
        if (materialId == null) {
            return
        }

        val params = mutableMapOf<String, Any?>("materialId" to materialId)
        val visibilityClause = if (authentication.isScheduleAdmin()) {
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

        val exists = dataRepo.sql(
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
            throw ProjectResponseException(HttpStatus.BAD_REQUEST, "materialId does not exist.")
        }
    }

    private fun lessonSelect(whereClause: String): String =
        """
        SELECT l.id,
               l.lesson_template_id,
               COALESCE(l.material_id, lt.material_id) AS material_id,
               lm.title AS material_title,
               lt.course_id,
               c.title AS course_title,
               lt.title AS lesson_title,
               teacher.keycloak_subject AS teacher_subject,
               COALESCE(teacher.display_name, teacher.name, teacher.username) AS teacher_name,
               l.scheduled_start,
               l.scheduled_end,
               l.status,
               l.type,
               l.livekit_room_name,
               l.created_at,
               l.updated_at
          FROM lesson l
          LEFT JOIN lesson_template lt ON lt.id = l.lesson_template_id
          LEFT JOIN course c ON c.id = lt.course_id
          LEFT JOIN lesson_material lm ON lm.id = COALESCE(l.material_id, lt.material_id)
          LEFT JOIN app_user teacher ON teacher.id = l.teacher_user_id
          $whereClause
         ORDER BY CASE WHEN l.scheduled_start IS NULL THEN 1 ELSE 0 END,
                  l.scheduled_start,
                  l.created_at
        """.trimIndent()
}

private data class ValidatedScheduledLessonRequest(
    val lessonTemplateId: UUID?,
    val materialId: UUID?,
    val scheduledStart: Instant?,
    val scheduledEnd: Instant?,
    val status: String,
    val type: String,
    val participantSubjects: List<String>,
)

private fun ScheduledLessonRequest.validated(): ValidatedScheduledLessonRequest {
    if (scheduledStart != null && scheduledEnd != null && !scheduledEnd.isAfter(scheduledStart)) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "scheduledEnd must be after scheduledStart.")
    }

    val cleanedStatus = status.trim().uppercase()
    if (cleanedStatus !in scheduleStatuses) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "Unsupported lesson status.")
    }

    val cleanedType = type.trim().uppercase()
    if (cleanedType !in scheduleTypes) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "Unsupported lesson type.")
    }

    return ValidatedScheduledLessonRequest(
        lessonTemplateId = lessonTemplateId,
        materialId = materialId,
        scheduledStart = scheduledStart,
        scheduledEnd = scheduledEnd,
        status = cleanedStatus,
        type = cleanedType,
        participantSubjects = participantSubjects,
    )
}

private fun JwtAuthenticationToken.requireScheduleManager() {
    if (!canManageSchedule()) {
        throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
    }
}

private fun JwtAuthenticationToken.canManageSchedule(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN }

private fun JwtAuthenticationToken.isScheduleAdmin(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }

private fun StoredScheduledLesson.toResponse(participants: List<StoredLessonParticipant>): ScheduledLessonResponse =
    ScheduledLessonResponse(
        id = id,
        lessonTemplateId = lessonTemplateId,
        materialId = materialId,
        materialTitle = materialTitle,
        courseId = courseId,
        courseTitle = courseTitle,
        lessonTitle = lessonTitle,
        teacherSubject = teacherSubject,
        teacherName = teacherName,
        scheduledStart = scheduledStart,
        scheduledEnd = scheduledEnd,
        status = status,
        type = type,
        livekitRoomName = livekitRoomName,
        participants = participants.map { participant -> participant.toResponse() },
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun StoredScheduledLesson.isVisibleToParticipant(now: Instant): Boolean =
    status !in expiredParticipantStatuses && scheduledEnd?.isAfter(now) != false

private fun StoredLessonParticipant.toResponse(): ScheduledLessonParticipantResponse =
    ScheduledLessonParticipantResponse(
        subject = subject,
        username = username,
        displayName = displayName,
        attendanceStatus = attendanceStatus,
    )

private fun mapScheduledLesson(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): StoredScheduledLesson =
    StoredScheduledLesson(
        id = rs.getObject("id", UUID::class.java),
        lessonTemplateId = rs.getObject("lesson_template_id", UUID::class.java),
        materialId = rs.getObject("material_id", UUID::class.java),
        materialTitle = rs.getString("material_title"),
        courseId = rs.getObject("course_id", UUID::class.java),
        courseTitle = rs.getString("course_title"),
        lessonTitle = rs.getString("lesson_title"),
        teacherSubject = rs.getString("teacher_subject"),
        teacherName = rs.getString("teacher_name"),
        scheduledStart = rs.getNullableScheduleInstant("scheduled_start"),
        scheduledEnd = rs.getNullableScheduleInstant("scheduled_end"),
        status = rs.getString("status"),
        type = rs.getString("type"),
        livekitRoomName = rs.getString("livekit_room_name"),
        createdAt = rs.getScheduleInstant("created_at"),
        updatedAt = rs.getScheduleInstant("updated_at"),
    )

private fun mapLessonParticipant(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): StoredLessonParticipant =
    StoredLessonParticipant(
        lessonId = rs.getObject("lesson_id", UUID::class.java),
        userId = rs.getObject("student_user_id", UUID::class.java),
        subject = rs.getString("keycloak_subject"),
        username = rs.getString("username"),
        displayName = rs.getString("display_name"),
        attendanceStatus = rs.getString("attendance_status"),
    )

private fun ResultSet.getNullableScheduleInstant(columnName: String): Instant? =
    getObject(columnName, OffsetDateTime::class.java)?.toInstant()

private fun ResultSet.getScheduleInstant(columnName: String): Instant =
    getObject(columnName, OffsetDateTime::class.java).toInstant()

private fun Instant.toScheduleOffsetDateTime(): OffsetDateTime =
    atOffset(ZoneOffset.UTC)

private val scheduleStatuses = setOf("SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED")
private val scheduleTypes = setOf("INDIVIDUAL", "GROUP")
private val expiredParticipantStatuses = setOf("COMPLETED", "CANCELLED")
