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
    private val lessonReminderService: LessonReminderService,
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
        val now = Instant.now()
        val occurrences = values.occurrences()
        val recurrenceSeriesId = values.recurrence?.let { UUID.randomUUID() }
        val recurrenceTotal = values.recurrence?.count

        val createdLessons = occurrences.mapIndexed { index, occurrence ->
            val id = UUID.randomUUID()
            lessonRepo.saveAndFlush(
                LessonEntity(
                    id = id,
                    lessonTemplateId = values.lessonTemplateId,
                    materialId = values.sharedMaterialId(),
                    teacherUserId = teacherUserId,
                    scheduledStart = occurrence.scheduledStart,
                    scheduledEnd = occurrence.scheduledEnd,
                    status = values.status,
                    type = values.type,
                    workMode = values.workMode,
                    recurrenceSeriesId = recurrenceSeriesId,
                    recurrenceIndex = recurrenceSeriesId?.let { index + 1 },
                    recurrenceTotal = recurrenceTotal,
                    livekitRoomName = "lesson-$id",
                    createdAt = now,
                    updatedAt = now,
                ),
            )

            replaceParticipants(id, participants, materialAssignments)
            lessonReminderService.rebuildPendingReminders(
                lessonId = id,
                teacherUserId = teacherUserId,
                participantUserIds = participants.map { participant -> participant.userId },
                scheduledStart = occurrence.scheduledStart,
                status = values.status,
                now = now,
            )
            requireNotNull(find(id)).withParticipants()
        }

        createdLessons.forEach { created -> eventPublisher.publishEvent(LessonChangedEvent(created)) }
        return createdLessons.first()
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
        val values = request.validated(allowRecurrence = false)
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
        lessonReminderService.rebuildPendingReminders(
            lessonId = lessonId,
            teacherUserId = lesson.teacherUserId,
            participantUserIds = participants.map { participant -> participant.userId },
            scheduledStart = lesson.scheduledStart,
            status = lesson.status,
        )
        val updated = requireNotNull(find(lessonId)).withParticipants()
        eventPublisher.publishEvent(LessonChangedEvent(updated))
        return updated
    }

    @Transactional
    fun assignSharedMaterial(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        materialId: UUID,
    ): ScheduledLessonResponse {
        authentication.requireScheduleManager()
        validateMaterialId(authentication, materialId)
        val lesson = lessonRepo.lockById(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        if (lesson.workMode == MetaData.LessonWorkModes.PARALLEL) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_IMAGE_PAGE_PARALLEL_UNSUPPORTED,
            )
        }

        lesson.materialId = materialId
        lesson.updatedAt = Instant.now()
        lessonRepo.saveAndFlush(lesson)

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

        lessonReminderService.cancelPendingReminders(lessonId)
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
        lessonReminderService.cancelPendingReminders(lessonId)

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

private data class ScheduledParticipant(
    val subject: String,
    val userId: UUID,
)

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
        recurrenceSeriesId = recurrenceSeriesId,
        recurrenceIndex = recurrenceIndex,
        recurrenceTotal = recurrenceTotal,
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

private val expiredParticipantStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
