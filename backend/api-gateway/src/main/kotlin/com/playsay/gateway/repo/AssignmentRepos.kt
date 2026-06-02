package com.playsay.gateway.repo

import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.AssignmentRecipientEntity
import com.playsay.gateway.entity.SubmissionEntity
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

data class MaterialSubmissionRow(
    val id: UUID,
    val assignmentId: UUID,
    val lessonId: UUID?,
    val materialId: UUID?,
    val userId: UUID,
    val userSubject: String?,
    val userName: String?,
    val content: String?,
    val score: BigDecimal?,
    val errorsCount: Int?,
    val submittedAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

interface AssignmentRepo : JpaRepository<AssignmentEntity, UUID> {
    fun findFirstByLessonIdAndMaterialIdAndMaterialBlockIdIsNullAndTypeOrderByCreatedAtAsc(
        lessonId: UUID,
        materialId: UUID,
        type: String,
    ): AssignmentEntity?

    fun findByTeacherUserIdAndTypeAndStatusNotOrderByUpdatedAtDesc(
        teacherUserId: UUID,
        type: String,
        status: String,
    ): List<AssignmentEntity>

    fun findByTypeAndStatusNotOrderByUpdatedAtDesc(
        type: String,
        status: String,
    ): List<AssignmentEntity>

    fun findByIdAndTypeAndStatusNot(
        id: UUID,
        type: String,
        status: String,
    ): AssignmentEntity?

    fun findFirstBySourceLessonIdAndTypeAndStatusNotOrderByCreatedAtAsc(
        sourceLessonId: UUID,
        type: String,
        status: String,
    ): AssignmentEntity?
}

interface AssignmentRecipientRepo : JpaRepository<AssignmentRecipientEntity, UUID> {
    fun findByAssignmentIdOrderByCreatedAtAsc(assignmentId: UUID): List<AssignmentRecipientEntity>

    fun findByAssignmentIdAndStudentUserId(assignmentId: UUID, studentUserId: UUID): AssignmentRecipientEntity?

    fun findByStudentUserIdAndArchivedAtIsNullOrderByUpdatedAtDesc(studentUserId: UUID): List<AssignmentRecipientEntity>

    fun countByAssignmentIdAndStudentUserId(assignmentId: UUID, studentUserId: UUID): Long

    fun countByAssignmentId(assignmentId: UUID): Long
}

interface SubmissionRepo : JpaRepository<SubmissionEntity, UUID> {
    fun findFirstByAssignmentIdAndLessonIdAndStudentUserIdOrderByUpdatedAtDesc(
        assignmentId: UUID,
        lessonId: UUID,
        studentUserId: UUID,
    ): SubmissionEntity?

    fun findFirstByAssignmentIdAndStudentUserIdOrderByUpdatedAtDesc(
        assignmentId: UUID,
        studentUserId: UUID,
    ): SubmissionEntity?

    @Query(
        """
        select new com.playsay.gateway.repo.MaterialSubmissionRow(
            s.id,
            s.assignmentId,
            s.lessonId,
            a.materialId,
            s.studentUserId,
            student.keycloakSubject,
            coalesce(student.displayName, student.name, student.username, student.keycloakSubject),
            s.content,
            s.score,
            s.errorsCount,
            s.submittedAt,
            s.createdAt,
            s.updatedAt
        )
          from SubmissionEntity s
          join AssignmentEntity a on a.id = s.assignmentId
          join AppUserEntity student on student.id = s.studentUserId
         where s.assignmentId = :assignmentId
           and s.lessonId = :lessonId
         order by s.updatedAt desc
        """,
    )
    fun findMaterialSubmissionRows(assignmentId: UUID, lessonId: UUID): List<MaterialSubmissionRow>

    @Query(
        """
        select new com.playsay.gateway.repo.MaterialSubmissionRow(
            s.id,
            s.assignmentId,
            s.lessonId,
            a.materialId,
            s.studentUserId,
            student.keycloakSubject,
            coalesce(student.displayName, student.name, student.username, student.keycloakSubject),
            s.content,
            s.score,
            s.errorsCount,
            s.submittedAt,
            s.createdAt,
            s.updatedAt
        )
          from SubmissionEntity s
          join AssignmentEntity a on a.id = s.assignmentId
          join AppUserEntity student on student.id = s.studentUserId
         where s.assignmentId = :assignmentId
           and s.lessonId = :lessonId
           and s.studentUserId = :studentUserId
         order by s.updatedAt desc
        """,
    )
    fun findMaterialSubmissionRowsByStudent(
        assignmentId: UUID,
        lessonId: UUID,
        studentUserId: UUID,
    ): List<MaterialSubmissionRow>

    @Query(
        """
        select new com.playsay.gateway.repo.MaterialSubmissionRow(
            s.id,
            s.assignmentId,
            s.lessonId,
            a.materialId,
            s.studentUserId,
            student.keycloakSubject,
            coalesce(student.displayName, student.name, student.username, student.keycloakSubject),
            s.content,
            s.score,
            s.errorsCount,
            s.submittedAt,
            s.createdAt,
            s.updatedAt
        )
          from SubmissionEntity s
          join AssignmentEntity a on a.id = s.assignmentId
          join AppUserEntity student on student.id = s.studentUserId
         where s.assignmentId = :assignmentId
         order by s.studentUserId, s.updatedAt desc
        """,
    )
    fun findSubmissionRowsByAssignmentId(assignmentId: UUID): List<MaterialSubmissionRow>

    @Query(
        """
        select new com.playsay.gateway.repo.MaterialSubmissionRow(
            s.id,
            s.assignmentId,
            s.lessonId,
            a.materialId,
            s.studentUserId,
            student.keycloakSubject,
            coalesce(student.displayName, student.name, student.username, student.keycloakSubject),
            s.content,
            s.score,
            s.errorsCount,
            s.submittedAt,
            s.createdAt,
            s.updatedAt
        )
          from SubmissionEntity s
          join AssignmentEntity a on a.id = s.assignmentId
          join AppUserEntity student on student.id = s.studentUserId
         where s.assignmentId = :assignmentId
           and s.studentUserId = :studentUserId
         order by s.updatedAt desc
        """,
    )
    fun findSubmissionRowsByAssignmentIdAndStudentUserId(
        assignmentId: UUID,
        studentUserId: UUID,
    ): List<MaterialSubmissionRow>

    @Query(
        """
        select new com.playsay.gateway.repo.MaterialSubmissionRow(
            s.id,
            s.assignmentId,
            s.lessonId,
            a.materialId,
            s.studentUserId,
            student.keycloakSubject,
            coalesce(student.displayName, student.name, student.username, student.keycloakSubject),
            s.content,
            s.score,
            s.errorsCount,
            s.submittedAt,
            s.createdAt,
            s.updatedAt
        )
          from SubmissionEntity s
          join AssignmentEntity a on a.id = s.assignmentId
          join AppUserEntity student on student.id = s.studentUserId
         where s.id = :submissionId
        """,
    )
    fun findMaterialSubmissionRowById(submissionId: UUID): MaterialSubmissionRow?
}
