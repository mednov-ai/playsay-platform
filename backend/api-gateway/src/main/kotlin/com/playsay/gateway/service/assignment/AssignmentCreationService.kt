package com.playsay.gateway.service.assignment

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.HomeworkAssignmentRequest
import com.playsay.gateway.dto.LessonHomeworkRequest
import com.playsay.gateway.dto.VocabularyHomeworkRequest
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.service.MaterialScoringService
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

data class AssignmentCreationResult(
    val assignmentId: UUID,
    val recipients: List<AppUserEntity>,
    val change: String,
)

data class VocabularyAssignmentCreationResult(
    val assignmentId: UUID,
    val recipients: List<AppUserEntity>?,
    val createdAt: Instant?,
)

@Component
class AssignmentCreationService(
    private val assignmentRepo: AssignmentRepo,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val materialResolver: AssignmentMaterialResolver,
    private val recipientService: AssignmentRecipientService,
    private val materialScoringService: MaterialScoringService,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun createMaterialHomework(
        teacherUserId: UUID,
        isAdmin: Boolean,
        request: HomeworkAssignmentRequest,
    ): AssignmentCreationResult {
        val material = materialResolver.requireAssignable(teacherUserId, request.materialId, isAdmin)
        val recipients = recipientService.resolve(request.studentSubjects)
        recipientService.requireAccess(teacherUserId, recipients, isAdmin)
        val now = Instant.now()
        val assignment = assignmentRepo.saveAndFlush(
            AssignmentEntity(
                id = UUID.randomUUID(),
                teacherUserId = teacherUserId,
                materialId = material.id,
                title = request.title.cleanAssignmentField("title", 160) ?: material.title,
                instructions = request.instructions.cleanAssignmentField("instructions", 2_000),
                type = MetaData.AssignmentTypes.HOMEWORK,
                payload = objectMapper.writeValueAsString(objectMapper.createObjectNode().put("source", "homework")),
                maxScore = materialScoringService.maxScore(material.scoringRubric),
                dueAt = request.dueAt,
                status = MetaData.AssignmentStatuses.ACTIVE,
                createdAt = now,
                updatedAt = now,
            ),
        )
        recipientService.save(assignment.id, recipients, request.dueAt, now)
        return AssignmentCreationResult(assignment.id, recipients, "CREATED")
    }

    fun createVocabularyHomework(
        teacherUserId: UUID,
        request: VocabularyHomeworkRequest,
    ): VocabularyAssignmentCreationResult {
        if (request.mode !in vocabularyPracticeModes || request.wordLimit !in 1..30) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.INVALID_REQUEST)
        }
        request.planId?.let { planId ->
            assignmentRepo.findByTeacherUserIdAndPracticePlanId(teacherUserId, planId)?.let { existing ->
                return VocabularyAssignmentCreationResult(existing.id, null, null)
            }
        }
        request.sourcePracticeId?.let { sourcePracticeId ->
            assignmentRepo.findByTeacherUserIdAndSourceVocabularyPracticeId(teacherUserId, sourcePracticeId)?.let { existing ->
                return VocabularyAssignmentCreationResult(existing.id, null, null)
            }
        }
        val recipients = recipientService.resolve(request.studentSubjects)
        if (!recipientService.canManageVocabulary(teacherUserId, recipients, request.sourcePracticeId != null)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.STUDENT_ACCESS_DENIED)
        }
        val now = Instant.now()
        val assignment = assignmentRepo.saveAndFlush(
            AssignmentEntity(
                id = UUID.randomUUID(),
                teacherUserId = teacherUserId,
                contentKind = MetaData.AssignmentContentKinds.VOCABULARY_PRACTICE,
                practicePlanId = request.planId,
                sourceVocabularyPracticeId = request.sourcePracticeId,
                completionPolicy = request.completionPolicy.name,
                completionPolicyVersion = request.completionThresholds.policyVersion,
                completionThresholdsJson = objectMapper.writeValueAsString(request.completionThresholds),
                title = request.title.cleanAssignmentField("title", 160) ?: "Vocabulary practice",
                instructions = request.instructions.cleanAssignmentField("instructions", 2_000),
                type = MetaData.AssignmentTypes.HOMEWORK,
                payload = vocabularyPayload(request),
                dueAt = request.dueAt,
                status = MetaData.AssignmentStatuses.PREPARING,
                createdAt = now,
                updatedAt = now,
            ),
        )
        recipientService.save(assignment.id, recipients, request.dueAt, now)
        return VocabularyAssignmentCreationResult(assignment.id, recipients, now)
    }

    fun createLessonHomework(
        currentUserId: UUID,
        isAdmin: Boolean,
        lessonId: UUID,
        request: LessonHomeworkRequest,
    ): AssignmentCreationResult {
        lessonRepo.findById(lessonId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val scheduleRow = lessonRepo.findScheduleRowById(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val materialId = scheduleRow.materialId
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val material = materialResolver.require(materialId)
        val participantRows = lessonParticipantRepo.findParticipantRowsByLessonIds(listOf(lessonId))
        val recipients = recipientService.resolveLessonParticipants(participantRows, request.studentSubjects)
        recipientService.requireAccess(currentUserId, recipients, isAdmin)
        val now = Instant.now()
        val existingAssignment = assignmentRepo.findFirstBySourceLessonIdAndTypeAndStatusNotOrderByCreatedAtAsc(
            sourceLessonId = lessonId,
            type = MetaData.AssignmentTypes.HOMEWORK,
            status = MetaData.AssignmentStatuses.ARCHIVED,
        )
        val assignment = existingAssignment ?: AssignmentEntity(id = UUID.randomUUID(), createdAt = now)
        assignment.lessonId = lessonId
        assignment.sourceLessonId = lessonId
        assignment.teacherUserId = currentUserId
        assignment.materialId = material.id
        assignment.title = request.title.cleanAssignmentField("title", 160) ?: scheduleRow.lessonTitle ?: material.title
        assignment.instructions = request.instructions.cleanAssignmentField("instructions", 2_000)
        assignment.type = MetaData.AssignmentTypes.HOMEWORK
        assignment.payload = objectMapper.writeValueAsString(objectMapper.createObjectNode().put("source", "lesson_homework"))
        assignment.maxScore = materialScoringService.maxScore(material.scoringRubric)
        assignment.dueAt = request.dueAt
        assignment.status = MetaData.AssignmentStatuses.ACTIVE
        assignment.updatedAt = now

        val saved = assignmentRepo.saveAndFlush(assignment)
        recipientService.save(saved.id, recipients, request.dueAt, now)
        return AssignmentCreationResult(saved.id, recipients, if (existingAssignment == null) "CREATED" else "UPDATED")
    }

    private fun vocabularyPayload(request: VocabularyHomeworkRequest): String =
        objectMapper.writeValueAsString(
            objectMapper.createObjectNode().apply {
                put("source", "vocabulary")
                put("mode", request.mode)
                put("wordLimit", request.wordLimit)
                request.planId?.let { planId -> put("planId", planId.toString()) }
                request.sourcePracticeId?.let { practiceId -> put("sourcePracticeId", practiceId.toString()) }
                put("completionPolicy", request.completionPolicy.name)
                set<com.fasterxml.jackson.databind.JsonNode>("completionThresholds", objectMapper.valueToTree(request.completionThresholds))
                put("keyMode", request.keyMode.name)
                set<com.fasterxml.jackson.databind.JsonNode>("keyNgramSettings", objectMapper.valueToTree(request.keyNgramSettings))
            },
        )
}

private val vocabularyPracticeModes = setOf("QUICK", "BALANCED", "WRITING", "KEYBOARD")
