package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.AssignmentRecipientProgressResponse
import com.playsay.gateway.dto.AssignmentSubmissionResponse
import com.playsay.gateway.dto.AssignmentSummaryResponse
import com.playsay.gateway.dto.HomeworkAssignmentRequest
import com.playsay.gateway.dto.LessonHomeworkRequest
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.StudentAssignmentDetailResponse
import com.playsay.gateway.dto.TeacherAssignmentDetailResponse
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.AssignmentRecipientEntity
import com.playsay.gateway.entity.SubmissionEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.repo.LessonParticipantRow
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.repo.MaterialSubmissionRow
import com.playsay.gateway.repo.SubmissionRepo
import com.playsay.gateway.utils.MetaData
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.util.UUID
import kotlin.math.roundToInt
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

private typealias StoredAssignment = AssignmentEntity
private typealias StoredAssignmentRecipient = AssignmentRecipientEntity
private typealias StoredHomeworkSubmission = MaterialSubmissionRow
private typealias StoredHomeworkMaterial = LessonMaterialRow

@Component
class AssignmentStore(
    private val assignmentRepo: AssignmentRepo,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val submissionRepo: SubmissionRepo,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val appUserRepo: AppUserRepo,
    private val userProfileStore: UserProfileStore,
    private val materialScoringService: MaterialScoringService,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    @Transactional
    fun createHomework(authentication: JwtAuthenticationToken, request: HomeworkAssignmentRequest): TeacherAssignmentDetailResponse {
        authentication.requireAssignmentManager()
        val teacherUserId = userProfileStore.currentUserId(authentication)
        val material = assignableMaterial(authentication, teacherUserId, request.materialId)
        val recipients = resolveRecipientUsers(request.studentSubjects)
        val now = Instant.now()
        val title = request.title.optionalClean("title", 160) ?: material.title
        val instructions = request.instructions.optionalClean("instructions", 2_000)
        val assignment = assignmentRepo.saveAndFlush(
            AssignmentEntity(
                id = UUID.randomUUID(),
                teacherUserId = teacherUserId,
                materialId = material.id,
                title = title,
                instructions = instructions,
                type = MetaData.AssignmentTypes.HOMEWORK,
                payload = objectMapper.writeValueAsString(objectMapper.createObjectNode().put("source", "homework")),
                maxScore = materialScoringService.maxScore(material.scoringRubric),
                dueAt = request.dueAt,
                status = MetaData.AssignmentStatuses.ACTIVE,
                createdAt = now,
                updatedAt = now,
            ),
        )
        ensureRecipients(assignment.id, recipients, request.dueAt, now)
        return teacherDetail(authentication, assignment.id)
    }

    @Transactional
    fun createHomeworkFromLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: LessonHomeworkRequest,
    ): TeacherAssignmentDetailResponse {
        authentication.requireAssignmentManager()
        val currentUserId = userProfileStore.currentUserId(authentication)
        val lesson = lessonRepo.findById(lessonId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        if (!authentication.isAssignmentAdmin() && lesson.teacherUserId != currentUserId) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }
        val scheduleRow = lessonRepo.findScheduleRowById(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val materialId = scheduleRow.materialId
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val material = materialById(materialId)
        val participantRows = lessonParticipantRepo.findParticipantRowsByLessonIds(listOf(lessonId))
        val recipients = lessonHomeworkRecipients(participantRows, request.studentSubjects)
        val now = Instant.now()
        val title = request.title.optionalClean("title", 160) ?: scheduleRow.lessonTitle ?: material.title
        val instructions = request.instructions.optionalClean("instructions", 2_000)
        val assignment = assignmentRepo.findFirstBySourceLessonIdAndTypeAndStatusNotOrderByCreatedAtAsc(
            sourceLessonId = lessonId,
            type = MetaData.AssignmentTypes.HOMEWORK,
            status = MetaData.AssignmentStatuses.ARCHIVED,
        ) ?: AssignmentEntity(
            id = UUID.randomUUID(),
            createdAt = now,
        )

        assignment.lessonId = lessonId
        assignment.sourceLessonId = lessonId
        assignment.teacherUserId = lesson.teacherUserId ?: currentUserId
        assignment.materialId = material.id
        assignment.title = title
        assignment.instructions = instructions
        assignment.type = MetaData.AssignmentTypes.HOMEWORK
        assignment.payload = objectMapper.writeValueAsString(objectMapper.createObjectNode().put("source", "lesson_homework"))
        assignment.maxScore = materialScoringService.maxScore(material.scoringRubric)
        assignment.dueAt = request.dueAt
        assignment.status = MetaData.AssignmentStatuses.ACTIVE
        assignment.updatedAt = now

        val saved = assignmentRepo.saveAndFlush(assignment)
        ensureRecipients(saved.id, recipients, request.dueAt, now)
        return teacherDetail(authentication, saved.id)
    }

    @Transactional(readOnly = true)
    fun listTeacherAssignments(authentication: JwtAuthenticationToken): List<AssignmentSummaryResponse> {
        authentication.requireAssignmentManager()
        val currentUserId = userProfileStore.currentUserId(authentication)
        val assignments = if (authentication.isAssignmentAdmin()) {
            assignmentRepo.findByTypeAndStatusNotOrderByUpdatedAtDesc(
                type = MetaData.AssignmentTypes.HOMEWORK,
                status = MetaData.AssignmentStatuses.ARCHIVED,
            )
        } else {
            assignmentRepo.findByTeacherUserIdAndTypeAndStatusNotOrderByUpdatedAtDesc(
                teacherUserId = currentUserId,
                type = MetaData.AssignmentTypes.HOMEWORK,
                status = MetaData.AssignmentStatuses.ARCHIVED,
            )
        }

        return assignments.map { assignment -> summary(assignment) }
    }

    @Transactional(readOnly = true)
    fun teacherDetail(authentication: JwtAuthenticationToken, assignmentId: UUID): TeacherAssignmentDetailResponse {
        authentication.requireAssignmentManager()
        val assignment = teacherAssignment(authentication, assignmentId)
        return TeacherAssignmentDetailResponse(
            assignment = summary(assignment),
            recipients = recipientProgress(assignment),
        )
    }

    @Transactional(readOnly = true)
    fun listStudentAssignments(authentication: JwtAuthenticationToken): List<AssignmentSummaryResponse> {
        val userId = userProfileStore.currentUserId(authentication)
        return assignmentRecipientRepo.findByStudentUserIdAndArchivedAtIsNullOrderByUpdatedAtDesc(userId)
            .mapNotNull { recipient ->
                assignmentRepo.findByIdAndTypeAndStatusNot(
                    id = recipient.assignmentId,
                    type = MetaData.AssignmentTypes.HOMEWORK,
                    status = MetaData.AssignmentStatuses.ARCHIVED,
                )
            }
            .map { assignment -> summary(assignment) }
    }

    @Transactional
    fun studentDetail(authentication: JwtAuthenticationToken, assignmentId: UUID): StudentAssignmentDetailResponse {
        val userId = userProfileStore.currentUserId(authentication)
        val assignment = studentAssignment(assignmentId, userId)
        val material = materialById(requireNotNull(assignment.materialId))
        val submission = findHomeworkSubmission(assignment.id, userId)
            ?: createEmptyHomeworkSubmission(assignment, material.id, userId)
        return StudentAssignmentDetailResponse(
            assignment = summary(assignment),
            material = material.toResponse(objectMapper),
            submission = submission.toResponse(objectMapper, recipientCount(assignment.id), assignment.maxScore),
        )
    }

    @Transactional(readOnly = true)
    fun studentMaterial(authentication: JwtAuthenticationToken, assignmentId: UUID): LessonMaterialResponse {
        val userId = userProfileStore.currentUserId(authentication)
        val assignment = studentAssignment(assignmentId, userId)
        return materialById(requireNotNull(assignment.materialId)).toResponse(objectMapper)
    }

    @Transactional
    fun studentSubmission(authentication: JwtAuthenticationToken, assignmentId: UUID): AssignmentSubmissionResponse {
        val userId = userProfileStore.currentUserId(authentication)
        val assignment = studentAssignment(assignmentId, userId)
        val material = materialById(requireNotNull(assignment.materialId))
        val submission = findHomeworkSubmission(assignment.id, userId)
            ?: createEmptyHomeworkSubmission(assignment, material.id, userId)
        return submission.toResponse(objectMapper, recipientCount(assignment.id), assignment.maxScore)
    }

    @Transactional
    fun saveStudentSubmission(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
        request: MaterialSubmissionRequest,
    ): AssignmentSubmissionResponse {
        val userId = userProfileStore.currentUserId(authentication)
        val assignment = studentAssignment(assignmentId, userId)
        val materialId = requireNotNull(assignment.materialId)
        val material = materialById(materialId)
        validateJsonSize("content", request.content, objectMapper, 1_000_000)

        val now = Instant.now()
        val scoring = materialScoringService.score(material.document, material.scoringRubric, request.content)
        val content = objectMapper.writeValueAsString(scoring?.content ?: request.content)
        val existing = findHomeworkSubmission(assignment.id, userId)
        val submissionId = if (existing == null) {
            submissionRepo.saveAndFlush(
                SubmissionEntity(
                    id = UUID.randomUUID(),
                    assignmentId = assignment.id,
                    studentUserId = userId,
                    lessonId = assignment.lessonId,
                    content = content,
                    score = scoring?.score,
                    errorsCount = scoring?.errorsCount,
                    submittedAt = if (request.submitted) now else null,
                    createdAt = now,
                    updatedAt = now,
                ),
            ).id
        } else {
            val entity = submissionRepo.findById(existing.id).orElseThrow()
            entity.content = content
            entity.score = scoring?.score
            entity.errorsCount = scoring?.errorsCount
            if (request.submitted) {
                entity.submittedAt = now
            }
            entity.updatedAt = now
            submissionRepo.save(entity)
            existing.id
        }

        val recipient = assignmentRecipientRepo.findByAssignmentIdAndStudentUserId(assignment.id, userId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.ASSIGNMENT_NOT_FOUND)
        recipient.updatedAt = now
        assignmentRecipientRepo.save(recipient)

        assignment.updatedAt = now
        assignmentRepo.save(assignment)

        return requireNotNull(findSubmissionById(submissionId)).toResponse(objectMapper, recipientCount(assignment.id), assignment.maxScore)
    }

    private fun teacherAssignment(authentication: JwtAuthenticationToken, assignmentId: UUID): StoredAssignment {
        val assignment = assignmentRepo.findByIdAndTypeAndStatusNot(
            id = assignmentId,
            type = MetaData.AssignmentTypes.HOMEWORK,
            status = MetaData.AssignmentStatuses.ARCHIVED,
        ) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.ASSIGNMENT_NOT_FOUND)
        if (!authentication.isAssignmentAdmin()) {
            val currentUserId = userProfileStore.currentUserId(authentication)
            if (assignment.teacherUserId != currentUserId) {
                throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.ASSIGNMENT_NOT_FOUND)
            }
        }
        return assignment
    }

    private fun studentAssignment(assignmentId: UUID, studentUserId: UUID): StoredAssignment {
        if (assignmentRecipientRepo.countByAssignmentIdAndStudentUserId(assignmentId, studentUserId) == 0L) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.ASSIGNMENT_NOT_FOUND)
        }
        return assignmentRepo.findByIdAndTypeAndStatusNot(
            id = assignmentId,
            type = MetaData.AssignmentTypes.HOMEWORK,
            status = MetaData.AssignmentStatuses.ARCHIVED,
        ) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.ASSIGNMENT_NOT_FOUND)
    }

    private fun summary(assignment: StoredAssignment): AssignmentSummaryResponse {
        val materialId = assignment.materialId
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val material = materialById(materialId)
        val submissions = latestSubmissionsByStudent(assignment.id).values.toList()
        val scores = submissions.mapNotNull { submission -> submission.score }
        val errors = submissions.mapNotNull { submission -> submission.errorsCount?.let(::BigDecimal) }

        return AssignmentSummaryResponse(
            id = assignment.id,
            materialId = material.id,
            materialTitle = material.title,
            lessonId = assignment.lessonId,
            sourceLessonId = assignment.sourceLessonId,
            title = assignment.title,
            instructions = assignment.instructions,
            type = assignment.type,
            maxScore = assignment.maxScore,
            dueAt = assignment.dueAt,
            status = assignment.status,
            recipientCount = recipientCount(assignment.id),
            submittedCount = submissions.count { submission -> submission.submittedAt != null },
            scoredCount = scores.size,
            averageScore = scores.averageOrNull(),
            averageErrorsCount = errors.averageOrNull(),
            createdAt = assignment.createdAt,
            updatedAt = assignment.updatedAt,
        )
    }

    private fun recipientProgress(assignment: StoredAssignment): List<AssignmentRecipientProgressResponse> {
        val recipients = assignmentRecipientRepo.findByAssignmentIdOrderByCreatedAtAsc(assignment.id)
        val users = appUserRepo.findByIdIn(recipients.map { recipient -> recipient.studentUserId })
            .associateBy { user -> user.id }
        val latestByStudent = latestSubmissionsByStudent(assignment.id)
        val scoredSubmissions = latestByStudent.values.filter { submission -> submission.score != null }
        val scoredErrors = latestByStudent.values.mapNotNull { submission -> submission.errorsCount?.let(::BigDecimal) }
        val groupAverageScore = scoredSubmissions.mapNotNull { submission -> submission.score }.averageOrNull()
        val groupAverageErrors = scoredErrors.averageOrNull()
        val groupMode = recipients.size > 1

        return recipients.map { recipient ->
            val user = users[recipient.studentUserId]
            val submission = latestByStudent[recipient.studentUserId]
            val score = submission?.score
            val errorsCount = submission?.errorsCount
            val progressTone = if (groupMode) progressTone(score, assignment.maxScore, errorsCount) else null
            AssignmentRecipientProgressResponse(
                assignmentId = assignment.id,
                studentUserId = recipient.studentUserId,
                studentSubject = user?.keycloakSubject.orEmpty(),
                studentName = user?.displayLabel(),
                submissionId = submission?.id,
                hasSubmission = submission != null,
                submitted = submission?.submittedAt != null,
                score = score,
                maxScore = assignment.maxScore,
                scoreRatio = scoreRatio(score, assignment.maxScore),
                errorsCount = errorsCount,
                progressTone = progressTone,
                showGroupIndicator = progressTone != null,
                groupAverageScore = if (groupMode) groupAverageScore else null,
                groupAverageErrorsCount = if (groupMode) groupAverageErrors else null,
                relativeScoreDelta = if (groupMode && score != null && groupAverageScore != null) {
                    score.subtract(groupAverageScore).setScale(2, RoundingMode.HALF_UP)
                } else {
                    null
                },
                relativeErrorsDelta = if (groupMode && errorsCount != null && groupAverageErrors != null) {
                    BigDecimal(errorsCount).subtract(groupAverageErrors).setScale(2, RoundingMode.HALF_UP)
                } else {
                    null
                },
                submittedAt = submission?.submittedAt,
                updatedAt = submission?.updatedAt,
            )
        }
    }

    private fun latestSubmissionsByStudent(assignmentId: UUID): Map<UUID, StoredHomeworkSubmission> {
        val latest = linkedMapOf<UUID, StoredHomeworkSubmission>()
        submissionRepo.findSubmissionRowsByAssignmentId(assignmentId).forEach { row ->
            latest.putIfAbsent(row.userId, row)
        }
        return latest
    }

    private fun createEmptyHomeworkSubmission(
        assignment: StoredAssignment,
        materialId: UUID,
        userId: UUID,
    ): StoredHomeworkSubmission {
        val now = Instant.now()
        val submission = submissionRepo.saveAndFlush(
            SubmissionEntity(
                id = UUID.randomUUID(),
                assignmentId = assignment.id,
                studentUserId = userId,
                lessonId = assignment.lessonId,
                content = emptyHomeworkSubmissionContent(materialId),
                score = null,
                errorsCount = null,
                submittedAt = null,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return requireNotNull(findSubmissionById(submission.id))
    }

    private fun findHomeworkSubmission(assignmentId: UUID, userId: UUID): StoredHomeworkSubmission? =
        submissionRepo.findFirstByAssignmentIdAndStudentUserIdOrderByUpdatedAtDesc(
            assignmentId = assignmentId,
            studentUserId = userId,
        )?.let { submission -> findSubmissionById(submission.id) }

    private fun findSubmissionById(submissionId: UUID): StoredHomeworkSubmission? =
        submissionRepo.findMaterialSubmissionRowById(submissionId)

    private fun ensureRecipients(
        assignmentId: UUID,
        recipients: List<AppUserEntity>,
        dueAt: Instant?,
        now: Instant,
    ) {
        if (recipients.isEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.ASSIGNMENT_RECIPIENTS_REQUIRED)
        }
        recipients.distinctBy { user -> user.id }.forEach { user ->
            val existing = assignmentRecipientRepo.findByAssignmentIdAndStudentUserId(assignmentId, user.id)
            if (existing == null) {
                assignmentRecipientRepo.save(
                    AssignmentRecipientEntity(
                        id = UUID.randomUUID(),
                        assignmentId = assignmentId,
                        studentUserId = user.id,
                        assignedAt = now,
                        dueAt = dueAt,
                        createdAt = now,
                        updatedAt = now,
                    ),
                )
            } else {
                existing.dueAt = dueAt
                existing.archivedAt = null
                existing.updatedAt = now
                assignmentRecipientRepo.save(existing)
            }
        }
    }

    private fun resolveRecipientUsers(subjects: List<String>): List<AppUserEntity> {
        val normalized = normalizedSubjects(subjects)
        if (normalized.isEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.ASSIGNMENT_RECIPIENTS_REQUIRED)
        }
        val users = appUserRepo.findByKeycloakSubjectIn(normalized).associateBy { user -> user.keycloakSubject }
        val missing = normalized.firstOrNull { subject -> subject !in users }
        if (missing != null) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNKNOWN_PARTICIPANT_SUBJECT, missing)
        }
        return normalized.map { subject -> requireNotNull(users[subject]) }
    }

    private fun lessonHomeworkRecipients(
        participants: List<LessonParticipantRow>,
        requestedSubjects: List<String>?,
    ): List<AppUserEntity> {
        val selectedSubjects = requestedSubjects
            ?.let(::normalizedSubjects)
            ?.takeIf { subjects -> subjects.isNotEmpty() }
            ?: participants.map { participant -> participant.subject }
        if (selectedSubjects.isEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.ASSIGNMENT_RECIPIENTS_REQUIRED)
        }
        val participantsBySubject = participants.associateBy { participant -> participant.subject }
        val missing = selectedSubjects.firstOrNull { subject -> subject !in participantsBySubject }
        if (missing != null) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNKNOWN_PARTICIPANT_SUBJECT, missing)
        }
        val participantUserIds = selectedSubjects.map { subject -> requireNotNull(participantsBySubject[subject]).userId }
        val users = appUserRepo.findByIdIn(participantUserIds).associateBy { user -> user.id }
        return participantUserIds.map { userId -> requireNotNull(users[userId]) }
    }

    private fun normalizedSubjects(subjects: List<String>): List<String> =
        subjects
            .mapNotNull { subject -> subject.optionalClean("studentSubjects", 255) }
            .distinct()

    private fun assignableMaterial(
        authentication: JwtAuthenticationToken,
        currentUserId: UUID,
        materialId: UUID,
    ): StoredHomeworkMaterial {
        val material = materialById(materialId)
        val canAssign = authentication.isAssignmentAdmin() ||
            material.ownerTeacherUserId == currentUserId ||
            (material.visibility == MetaData.MaterialVisibility.PUBLIC && material.status == MetaData.MaterialStatuses.PUBLISHED)
        if (!canAssign) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return material
    }

    private fun materialById(materialId: UUID): StoredHomeworkMaterial =
        lessonMaterialRepo.findRowById(materialId)
            ?.takeIf { material -> material.status != MetaData.MaterialStatuses.ARCHIVED }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)

    private fun recipientCount(assignmentId: UUID): Int =
        assignmentRecipientRepo.countByAssignmentId(assignmentId).toInt()

    private fun emptyHomeworkSubmissionContent(materialId: UUID): String =
        objectMapper.writeValueAsString(
            objectMapper.createObjectNode().apply {
                put("schemaVersion", 1)
                put("materialId", materialId.toString())
                set<JsonNode>("answers", objectMapper.createObjectNode())
            },
        )
}

private fun StoredHomeworkMaterial.toResponse(objectMapper: ObjectMapper): LessonMaterialResponse {
    val documentNode = objectMapper.readTree(document)
    return LessonMaterialResponse(
        id = id,
        ownerTeacherUserId = ownerTeacherUserId,
        ownerTeacherSubject = ownerTeacherSubject,
        ownerTeacherName = ownerTeacherName,
        title = title,
        description = description,
        language = language,
        cefrLevel = cefrLevel,
        visibility = visibility,
        status = status,
        document = documentNode,
        sourceMeta = objectMapper.readTree(sourceMeta),
        scoringRubric = objectMapper.readTree(scoringRubric),
        blockCount = documentNode.blockCount(),
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
}

private fun StoredHomeworkSubmission.toResponse(
    objectMapper: ObjectMapper,
    recipientCount: Int,
    maxScore: BigDecimal?,
): AssignmentSubmissionResponse =
    AssignmentSubmissionResponse(
        id = id,
        assignmentId = assignmentId,
        lessonId = lessonId,
        materialId = requireNotNull(materialId),
        userId = userId,
        userSubject = userSubject,
        userName = userName,
        content = objectMapper.readTree(requireNotNull(content)),
        score = score,
        errorsCount = errorsCount,
        progressTone = if (recipientCount > 1) progressTone(score, maxScore = maxScore, errorsCount = errorsCount) else null,
        submittedAt = submittedAt,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun AppUserEntity.displayLabel(): String? =
    displayName ?: name ?: username ?: keycloakSubject

private fun JwtAuthenticationToken.requireAssignmentManager() {
    if (!canManageAssignments()) {
        throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
    }
}

private fun JwtAuthenticationToken.canManageAssignments(): Boolean =
    authorities.any { authority ->
        authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN
    }

private fun JwtAuthenticationToken.isAssignmentAdmin(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }

private fun String?.optionalClean(fieldName: String, maxLength: Int): String? {
    val cleaned = this?.trim()?.takeIf { it.isNotEmpty() }
    if (cleaned != null && cleaned.length > maxLength) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_TOO_LONG, fieldName, maxLength)
    }
    return cleaned
}

private fun validateJsonSize(fieldName: String, value: JsonNode, objectMapper: ObjectMapper, maxBytes: Int) {
    val byteSize = objectMapper.writeValueAsBytes(value).size
    if (byteSize > maxBytes) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.JSON_FIELD_TOO_LARGE, fieldName, maxBytes)
    }
}

private fun scoreRatio(score: BigDecimal?, maxScore: BigDecimal?): BigDecimal? {
    if (score == null || maxScore == null || maxScore.compareTo(BigDecimal.ZERO) <= 0) {
        return null
    }
    return score.divide(maxScore, 4, RoundingMode.HALF_UP)
        .coerceIn(BigDecimal.ZERO, BigDecimal.ONE)
        .setScale(2, RoundingMode.HALF_UP)
}

private fun progressTone(score: BigDecimal?, maxScore: BigDecimal?, errorsCount: Int?): Int? {
    if (score == null && errorsCount == null) {
        return null
    }
    val scorePercent = scoreRatio(score, maxScore)
        ?.multiply(BigDecimal("100"))
        ?.toDouble()
        ?: errorsCount?.let { errors -> 100.0 - (errors * 15.0) }
        ?: return null
    val errorPenalty = (errorsCount ?: 0).coerceAtLeast(0).coerceAtMost(8) * 4.0
    return (scorePercent - errorPenalty).roundToInt().coerceIn(0, 100)
}

private fun List<BigDecimal>.averageOrNull(): BigDecimal? {
    if (isEmpty()) {
        return null
    }
    return reduce(BigDecimal::add).divide(BigDecimal(size), 2, RoundingMode.HALF_UP)
}

private fun BigDecimal.coerceIn(min: BigDecimal, max: BigDecimal): BigDecimal =
    when {
        this < min -> min
        this > max -> max
        else -> this
    }
