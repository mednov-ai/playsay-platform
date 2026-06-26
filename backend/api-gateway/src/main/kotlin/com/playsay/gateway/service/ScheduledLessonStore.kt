package com.playsay.gateway.service

import com.playsay.gateway.dto.ScheduledLessonParticipantResponse
import com.playsay.gateway.dto.ScheduledLessonRequest
import com.playsay.gateway.dto.ScheduledLessonResponse
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonParticipantEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.realtime.LessonChangedEvent
import com.playsay.gateway.realtime.LessonDeletedEvent
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonParticipantRow
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.repo.LessonTemplateRepo
import com.playsay.gateway.repo.ScheduledLessonRow
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class ScheduledLessonStore(
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val lessonTemplateRepo: LessonTemplateRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val appUserRepo: AppUserRepo,
    private val userProfileStore: UserProfileStore,
    private val eventPublisher: ApplicationEventPublisher,
) {
    @Transactional(readOnly = true)
    fun list(authentication: JwtAuthenticationToken): List<ScheduledLessonResponse> {
        val rows = if (authentication.canManageSchedule()) {
            lessonRepo.findScheduleRowsForManager()
        } else {
            val now = Instant.now()
            lessonRepo.findScheduleRowsForStudent(
                subject = authentication.token.subject,
                visibleUntil = lessonAccessEndsAfter(now),
                excludedStatuses = expiredParticipantStatuses,
            )
        }

        return rows.withParticipants()
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
        values.participantAssignments.forEach { assignment -> validateMaterialId(authentication, assignment.materialId) }
        val participants = participants(values.participantSubjects)
        val materialAssignments = participantMaterialAssignments(values, participants)
        val id = UUID.randomUUID()
        val now = Instant.now()

        lessonRepo.saveAndFlush(
            LessonEntity(
                id = id,
                lessonTemplateId = values.lessonTemplateId,
                materialId = values.sharedMaterialId(),
                teacherUserId = teacherUserId,
                scheduledStart = values.scheduledStart,
                scheduledEnd = values.scheduledEnd,
                status = values.status,
                type = values.type,
                workMode = values.workMode,
                livekitRoomName = "lesson-$id",
                createdAt = now,
                updatedAt = now,
            ),
        )

        replaceParticipants(id, participants, materialAssignments)
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
        val lesson = lessonRepo.findById(lessonId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val values = request.validated()
        validateLessonTemplate(values.lessonTemplateId)
        validateMaterialId(authentication, values.materialId)
        values.participantAssignments.forEach { assignment -> validateMaterialId(authentication, assignment.materialId) }
        val participants = participants(values.participantSubjects)
        val materialAssignments = participantMaterialAssignments(values, participants)

        lesson.lessonTemplateId = values.lessonTemplateId
        lesson.materialId = values.sharedMaterialId()
        lesson.scheduledStart = values.scheduledStart
        lesson.scheduledEnd = values.scheduledEnd
        lesson.status = values.status
        lesson.type = values.type
        lesson.workMode = values.workMode
        lesson.updatedAt = Instant.now()
        lessonRepo.save(lesson)

        replaceParticipants(lessonId, participants, materialAssignments)
        val updated = requireNotNull(find(lessonId)).withParticipants()
        eventPublisher.publishEvent(LessonChangedEvent(updated))
        return updated
    }

    @Transactional
    fun delete(authentication: JwtAuthenticationToken, lessonId: UUID) {
        authentication.requireScheduleManager()
        if (!lessonRepo.existsById(lessonId)) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }

        lessonRepo.deleteById(lessonId)
        eventPublisher.publishEvent(LessonDeletedEvent(lessonId))
    }

    @Transactional
    fun complete(authentication: JwtAuthenticationToken, lessonId: UUID): ScheduledLessonResponse {
        authentication.requireScheduleManager()
        val lesson = lessonRepo.findById(lessonId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val now = Instant.now()

        lesson.status = MetaData.LessonStatuses.COMPLETED
        lesson.actualEnd = now
        lesson.updatedAt = now
        lessonRepo.save(lesson)

        val completed = requireNotNull(find(lessonId)).withParticipants()
        eventPublisher.publishEvent(LessonChangedEvent(completed))
        return completed
    }

    private fun findVisible(authentication: JwtAuthenticationToken, lessonId: UUID): ScheduledLessonRow? {
        val lesson = if (authentication.canManageSchedule()) {
            find(lessonId)
        } else {
            lessonRepo.findScheduleRowByIdForStudent(lessonId, authentication.token.subject)
        } ?: return null
        if (authentication.canManageSchedule()) {
            return lesson
        }

        if (!lesson.isVisibleToParticipant(Instant.now())) {
            return null
        }

        val isParticipant = lessonParticipantRepo.countByLessonIdAndStudentSubject(
            lessonId = lessonId,
            subject = authentication.token.subject,
        ) > 0

        return lesson.takeIf { isParticipant }
    }

    private fun find(lessonId: UUID): ScheduledLessonRow? =
        lessonRepo.findScheduleRowById(lessonId)

    private fun List<ScheduledLessonRow>.withParticipants(): List<ScheduledLessonResponse> {
        if (isEmpty()) {
            return emptyList()
        }

        val participantsByLesson = participantsFor(map { lesson -> lesson.id }).groupBy { participant -> participant.lessonId }
        return map { lesson -> lesson.toResponse(participantsByLesson[lesson.id].orEmpty()) }
    }

    private fun ScheduledLessonRow.withParticipants(): ScheduledLessonResponse =
        toResponse(participantsFor(listOf(id)))

    private fun participantsFor(lessonIds: List<UUID>): List<LessonParticipantRow> {
        if (lessonIds.isEmpty()) {
            return emptyList()
        }

        return lessonParticipantRepo.findParticipantRowsByLessonIds(lessonIds)
    }

    private fun participants(subjects: List<String>): List<ScheduledParticipant> {
        val cleanedSubjects = subjects.mapNotNull { subject -> subject.trim().takeIf { it.isNotEmpty() } }.distinct()
        if (cleanedSubjects.isEmpty()) {
            return emptyList()
        }

        val users = appUserRepo.findByKeycloakSubjectIn(cleanedSubjects)
            .associate { user -> user.keycloakSubject to user.id }

        val missingSubjects = cleanedSubjects.filter { subject -> subject !in users }
        if (missingSubjects.isNotEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNKNOWN_PARTICIPANT_SUBJECT, missingSubjects.first())
        }

        return cleanedSubjects.map { subject -> ScheduledParticipant(subject = subject, userId = requireNotNull(users[subject])) }
    }

    private fun participantMaterialAssignments(
        values: ValidatedScheduledLessonRequest,
        participants: List<ScheduledParticipant>,
    ): Map<String, UUID> {
        if (values.workMode == MetaData.LessonWorkModes.SHARED) {
            if (values.participantAssignments.isNotEmpty()) {
                throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, "workMode=PARALLEL")
            }
            return emptyMap()
        }

        val participantSubjects = participants.map { participant -> participant.subject }.toSet()
        if (participantSubjects.size < 2) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, "participantSubjects")
        }

        if (values.participantAssignments.isEmpty()) {
            val materialId = values.materialId
                ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, "participantAssignments")
            return participantSubjects.associateWith { materialId }
        }

        val assigned = linkedMapOf<String, UUID>()
        values.participantAssignments.forEach { assignment ->
            assignment.participantSubjects.forEach { subject ->
                if (subject !in participantSubjects) {
                    throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNKNOWN_PARTICIPANT_SUBJECT, subject)
                }
                if (assigned.putIfAbsent(subject, assignment.materialId) != null) {
                    throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, "participantAssignments")
                }
            }
        }

        val missing = participantSubjects.firstOrNull { subject -> subject !in assigned }
        if (missing != null) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, "participantAssignments:$missing")
        }

        return assigned
    }

    private fun replaceParticipants(
        lessonId: UUID,
        participants: List<ScheduledParticipant>,
        materialAssignments: Map<String, UUID>,
    ) {
        lessonParticipantRepo.deleteByLessonId(lessonId)
        lessonParticipantRepo.flush()
        lessonParticipantRepo.saveAll(
            participants.map { participant ->
                LessonParticipantEntity(
                    id = UUID.randomUUID(),
                    lessonId = lessonId,
                    studentUserId = participant.userId,
                    materialId = materialAssignments[participant.subject],
                    attendanceStatus = MetaData.AttendanceStatuses.PLANNED,
                )
            },
        )
    }

    private fun validateLessonTemplate(lessonTemplateId: UUID?) {
        if (lessonTemplateId == null) {
            return
        }

        if (!lessonTemplateRepo.existsById(lessonTemplateId)) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.LESSON_TEMPLATE_ID_NOT_FOUND)
        }
    }

    private fun validateMaterialId(authentication: JwtAuthenticationToken, materialId: UUID?) {
        if (materialId == null) {
            return
        }

        val exists = if (authentication.isScheduleAdmin()) {
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
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.MATERIAL_ID_NOT_FOUND)
        }
    }
}

private data class ValidatedScheduledLessonRequest(
    val lessonTemplateId: UUID?,
    val materialId: UUID?,
    val scheduledStart: Instant?,
    val scheduledEnd: Instant?,
    val status: String,
    val type: String,
    val workMode: String,
    val participantSubjects: List<String>,
    val participantAssignments: List<ValidatedScheduledLessonMaterialAssignment>,
)

private data class ValidatedScheduledLessonMaterialAssignment(
    val materialId: UUID,
    val participantSubjects: List<String>,
)

private data class ScheduledParticipant(
    val subject: String,
    val userId: UUID,
)

private fun ScheduledLessonRequest.validated(): ValidatedScheduledLessonRequest {
    if (scheduledStart != null && scheduledEnd != null && !scheduledEnd.isAfter(scheduledStart)) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.SCHEDULED_END_BEFORE_START)
    }

    val cleanedStatus = status.trim().uppercase()
    if (cleanedStatus !in scheduleStatuses) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_LESSON_STATUS)
    }

    val cleanedType = type.trim().uppercase()
    if (cleanedType !in scheduleTypes) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_LESSON_TYPE)
    }

    val cleanedWorkMode = workMode.trim().uppercase()
    if (cleanedWorkMode !in scheduleWorkModes) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_LESSON_WORK_MODE)
    }

    return ValidatedScheduledLessonRequest(
        lessonTemplateId = lessonTemplateId,
        materialId = materialId,
        scheduledStart = scheduledStart,
        scheduledEnd = scheduledEnd,
        status = cleanedStatus,
        type = cleanedType,
        workMode = cleanedWorkMode,
        participantSubjects = participantSubjects.mapNotNull { subject -> subject.trim().takeIf { it.isNotEmpty() } }.distinct(),
        participantAssignments = participantAssignments.map { assignment ->
            ValidatedScheduledLessonMaterialAssignment(
                materialId = assignment.materialId,
                participantSubjects = assignment.participantSubjects
                    .mapNotNull { subject -> subject.trim().takeIf { it.isNotEmpty() } }
                    .distinct(),
            )
        },
    )
}

private fun ValidatedScheduledLessonRequest.sharedMaterialId(): UUID? =
    if (workMode == MetaData.LessonWorkModes.SHARED) materialId else null

private fun JwtAuthenticationToken.requireScheduleManager() {
    if (!canManageSchedule()) {
        throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
    }
}

private fun JwtAuthenticationToken.canManageSchedule(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN }

private fun JwtAuthenticationToken.isScheduleAdmin(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }

private fun ScheduledLessonRow.toResponse(participants: List<LessonParticipantRow>): ScheduledLessonResponse =
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
        workMode = workMode,
        livekitRoomName = livekitRoomName,
        participants = participants.map { participant -> participant.toResponse() },
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun ScheduledLessonRow.isVisibleToParticipant(now: Instant): Boolean =
    status !in expiredParticipantStatuses && (scheduledEnd == null || !scheduledEnd.isBefore(lessonAccessEndsAfter(now)))

private fun LessonParticipantRow.toResponse(): ScheduledLessonParticipantResponse =
    ScheduledLessonParticipantResponse(
        subject = subject,
        username = username,
        displayName = displayName,
        attendanceStatus = attendanceStatus,
        materialId = materialId,
        materialTitle = materialTitle,
    )

private val scheduleStatuses = setOf(
    MetaData.LessonStatuses.SCHEDULED,
    MetaData.LessonStatuses.IN_PROGRESS,
    MetaData.LessonStatuses.COMPLETED,
    MetaData.LessonStatuses.CANCELLED,
)
private val scheduleTypes = setOf(MetaData.LessonTypes.INDIVIDUAL, MetaData.LessonTypes.GROUP)
private val scheduleWorkModes = setOf(MetaData.LessonWorkModes.SHARED, MetaData.LessonWorkModes.PARALLEL)
private val expiredParticipantStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
