package com.playsay.gateway.service.assignment

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.AssignmentRecipientProgressResponse
import com.playsay.gateway.dto.AssignmentSubmissionResponse
import com.playsay.gateway.dto.AssignmentSummaryResponse
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.AssignmentRecipientEntity
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.MaterialSubmissionRow
import com.playsay.gateway.repo.SubmissionRepo
import com.playsay.gateway.service.AssignmentProgressCalculator
import com.playsay.gateway.utils.MetaData
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.UUID
import org.springframework.stereotype.Component

@Component
class AssignmentProjectionService(
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val submissionRepo: SubmissionRepo,
    private val appUserRepo: AppUserRepo,
    private val materialResolver: AssignmentMaterialResolver,
    private val progressCalculator: AssignmentProgressCalculator,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun summary(assignment: AssignmentEntity, studentUserId: UUID? = null): AssignmentSummaryResponse =
        if (assignment.contentKind == MetaData.AssignmentContentKinds.VOCABULARY_PRACTICE) {
            vocabularySummary(assignment, studentUserId)
        } else {
            materialSummary(assignment, studentUserId)
        }

    fun summaryIfMaterialAvailable(
        assignment: AssignmentEntity,
        studentUserId: UUID? = null,
    ): AssignmentSummaryResponse? {
        if (assignment.contentKind == MetaData.AssignmentContentKinds.VOCABULARY_PRACTICE) {
            return vocabularySummary(assignment, studentUserId)
        }
        val materialId = assignment.materialId ?: return null
        val material = materialResolver.available(materialId) ?: return null
        return materialSummary(assignment, material.id, material.title, studentUserId)
    }

    fun recipientProgress(assignment: AssignmentEntity): List<AssignmentRecipientProgressResponse> {
        val recipients = assignmentRecipientRepo.findByAssignmentIdOrderByCreatedAtAsc(assignment.id)
        val users = appUserRepo.findByIdIn(recipients.map { recipient -> recipient.studentUserId })
            .associateBy(AppUserEntity::id)
        return if (assignment.contentKind == MetaData.AssignmentContentKinds.VOCABULARY_PRACTICE) {
            vocabularyRecipientProgress(assignment, recipients, users)
        } else {
            materialRecipientProgress(assignment, recipients, users)
        }
    }

    private fun vocabularyRecipientProgress(
        assignment: AssignmentEntity,
        recipients: List<AssignmentRecipientEntity>,
        users: Map<UUID, AppUserEntity>,
    ): List<AssignmentRecipientProgressResponse> = recipients.map { recipient ->
        val user = users[recipient.studentUserId]
        AssignmentRecipientProgressResponse(
            assignmentId = assignment.id,
            studentUserId = recipient.studentUserId,
            studentSubject = user?.keycloakSubject.orEmpty(),
            studentName = user?.displayLabel(),
            submissionId = null,
            hasSubmission = false,
            submitted = recipient.activityState == "COMPLETED",
            score = null,
            maxScore = null,
            scoreRatio = null,
            errorsCount = null,
            progressTone = null,
            showGroupIndicator = false,
            groupAverageScore = null,
            groupAverageErrorsCount = null,
            relativeScoreDelta = null,
            relativeErrorsDelta = null,
            submittedAt = recipient.activityUpdatedAt.takeIf { recipient.activityState == "COMPLETED" },
            updatedAt = recipient.activityUpdatedAt ?: recipient.updatedAt,
            activityRef = recipient.activityRef,
            activityState = recipient.activityState,
            completionRatio = recipient.completionRatio,
            accuracy = recipient.accuracy,
            difficultWordCount = recipient.difficultWordCount,
        )
    }

    private fun materialRecipientProgress(
        assignment: AssignmentEntity,
        recipients: List<AssignmentRecipientEntity>,
        users: Map<UUID, AppUserEntity>,
    ): List<AssignmentRecipientProgressResponse> {
        val latestByStudent = latestSubmissionsByStudent(assignment.id)
        val scoredSubmissions = latestByStudent.values.filter { submission -> submission.score != null }
        val scoredErrors = latestByStudent.values.mapNotNull { submission -> submission.errorsCount?.let(::BigDecimal) }
        val groupAverageScore = progressCalculator.average(scoredSubmissions.mapNotNull { submission -> submission.score })
        val groupAverageErrors = progressCalculator.average(scoredErrors)
        val groupMode = recipients.size > 1
        return recipients.map { recipient ->
            val user = users[recipient.studentUserId]
            val submission = latestByStudent[recipient.studentUserId]
            val score = submission?.score
            val errorsCount = submission?.errorsCount
            val progressTone = groupMode.takeIf { it }
                ?.let { progressCalculator.progressTone(score, assignment.maxScore, errorsCount) }
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
                scoreRatio = progressCalculator.scoreRatio(score, assignment.maxScore),
                errorsCount = errorsCount,
                progressTone = progressTone,
                showGroupIndicator = progressTone != null,
                groupAverageScore = groupAverageScore.takeIf { groupMode },
                groupAverageErrorsCount = groupAverageErrors.takeIf { groupMode },
                relativeScoreDelta = relativeDelta(groupMode, score, groupAverageScore),
                relativeErrorsDelta = relativeDelta(groupMode, errorsCount?.let(::BigDecimal), groupAverageErrors),
                submittedAt = submission?.submittedAt,
                updatedAt = submission?.updatedAt,
            )
        }
    }

    fun submission(row: MaterialSubmissionRow, assignment: AssignmentEntity): AssignmentSubmissionResponse =
        AssignmentSubmissionResponse(
            id = row.id,
            assignmentId = row.assignmentId,
            lessonId = row.lessonId,
            materialId = requireNotNull(row.materialId),
            userId = row.userId,
            userSubject = row.userSubject,
            userName = row.userName,
            content = objectMapper.readTree(requireNotNull(row.content)),
            score = row.score,
            errorsCount = row.errorsCount,
            progressTone = if (recipientCount(assignment.id) > 1) {
                progressCalculator.progressTone(row.score, assignment.maxScore, row.errorsCount)
            } else {
                null
            },
            submittedAt = row.submittedAt,
            createdAt = row.createdAt,
            updatedAt = row.updatedAt,
        )

    private fun materialSummary(assignment: AssignmentEntity, studentUserId: UUID?): AssignmentSummaryResponse {
        val material = materialResolver.require(requireNotNull(assignment.materialId))
        return materialSummary(assignment, material.id, material.title, studentUserId)
    }

    private fun materialSummary(
        assignment: AssignmentEntity,
        materialId: UUID,
        materialTitle: String,
        studentUserId: UUID?,
    ): AssignmentSummaryResponse {
        val submissionsByStudent = latestSubmissionsByStudent(assignment.id)
        val submissions = submissionsByStudent.values.toList()
        val scores = submissions.mapNotNull(MaterialSubmissionRow::score)
        val errors = submissions.mapNotNull { submission -> submission.errorsCount?.let(::BigDecimal) }
        val studentSubmission = studentUserId?.let(submissionsByStudent::get)
        return AssignmentSummaryResponse(
            id = assignment.id,
            materialId = materialId,
            materialTitle = materialTitle,
            contentKind = MetaData.AssignmentContentKinds.MATERIAL,
            activityRef = null,
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
            averageScore = progressCalculator.average(scores),
            averageErrorsCount = progressCalculator.average(errors),
            createdAt = assignment.createdAt,
            updatedAt = assignment.updatedAt,
            mySubmissionState = when {
                studentUserId == null -> null
                studentSubmission == null -> MetaData.HomeworkSubmissionStates.NOT_STARTED
                studentSubmission.submittedAt == null -> MetaData.HomeworkSubmissionStates.DRAFT
                else -> MetaData.HomeworkSubmissionStates.SUBMITTED
            },
            myScore = studentSubmission?.score,
            mySubmittedAt = studentSubmission?.submittedAt,
            mySubmissionUpdatedAt = studentSubmission?.updatedAt,
        )
    }

    private fun vocabularySummary(assignment: AssignmentEntity, studentUserId: UUID?): AssignmentSummaryResponse {
        val recipients = assignmentRecipientRepo.findByAssignmentIdOrderByCreatedAtAsc(assignment.id)
        val studentRecipient = studentUserId?.let { id -> recipients.firstOrNull { it.studentUserId == id } }
        val completed = recipients.count { it.activityState == "COMPLETED" }
        val difficultCounts = recipients.mapNotNull { it.difficultWordCount?.let(::BigDecimal) }
        return AssignmentSummaryResponse(
            id = assignment.id,
            materialId = null,
            materialTitle = null,
            contentKind = MetaData.AssignmentContentKinds.VOCABULARY_PRACTICE,
            activityRef = assignment.activityRef,
            lessonId = assignment.lessonId,
            sourceLessonId = assignment.sourceLessonId,
            title = assignment.title,
            instructions = assignment.instructions,
            type = assignment.type,
            maxScore = null,
            dueAt = assignment.dueAt,
            status = assignment.status,
            recipientCount = recipients.size,
            submittedCount = completed,
            scoredCount = recipients.count { it.accuracy != null },
            averageScore = null,
            averageErrorsCount = progressCalculator.average(difficultCounts),
            createdAt = assignment.createdAt,
            updatedAt = assignment.updatedAt,
            mySubmissionState = when (studentRecipient?.activityState) {
                null, "NOT_STARTED" -> if (studentUserId == null) null else MetaData.HomeworkSubmissionStates.NOT_STARTED
                "COMPLETED" -> MetaData.HomeworkSubmissionStates.SUBMITTED
                else -> MetaData.HomeworkSubmissionStates.DRAFT
            },
            myScore = null,
            mySubmittedAt = studentRecipient?.activityUpdatedAt?.takeIf { studentRecipient.activityState == "COMPLETED" },
            mySubmissionUpdatedAt = studentRecipient?.activityUpdatedAt,
            myActivityState = studentRecipient?.activityState,
            myCompletionRatio = studentRecipient?.completionRatio,
            myAccuracy = studentRecipient?.accuracy,
            myDifficultWordCount = studentRecipient?.difficultWordCount,
        )
    }

    private fun latestSubmissionsByStudent(assignmentId: UUID): Map<UUID, MaterialSubmissionRow> {
        val latest = linkedMapOf<UUID, MaterialSubmissionRow>()
        submissionRepo.findSubmissionRowsByAssignmentId(assignmentId).forEach { row -> latest.putIfAbsent(row.userId, row) }
        return latest
    }

    private fun recipientCount(assignmentId: UUID): Int = assignmentRecipientRepo.countByAssignmentId(assignmentId).toInt()

    private fun relativeDelta(groupMode: Boolean, value: BigDecimal?, average: BigDecimal?): BigDecimal? =
        if (groupMode && value != null && average != null) {
            value.subtract(average).setScale(2, RoundingMode.HALF_UP)
        } else {
            null
        }
}

private fun AppUserEntity.displayLabel(): String? = displayName ?: name ?: username ?: keycloakSubject
