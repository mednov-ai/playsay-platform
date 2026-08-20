package com.playsay.gateway.repo.schedule

import com.playsay.gateway.entity.LessonParticipantEntity
import com.playsay.gateway.repo.LessonParticipantRow
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface LessonParticipantRepo : JpaRepository<LessonParticipantEntity, UUID> {
    fun deleteByLessonId(lessonId: UUID): Long

    fun findByLessonId(lessonId: UUID): List<LessonParticipantEntity>

    fun findByStudentUserId(studentUserId: UUID): List<LessonParticipantEntity>

    @Query(
        """
        select count(lp) > 0
          from LessonParticipantEntity lp
          join AppUserEntity student on student.id = lp.studentUserId
         where lp.lessonId = :lessonId
           and student.keycloakSubject = :subject
        """,
    )
    fun existsByLessonIdAndSubject(lessonId: UUID, subject: String): Boolean

    @Query(
        """
        select new com.playsay.gateway.repo.LessonParticipantRow(
            lp.lessonId,
            lp.studentUserId,
            student.keycloakSubject,
            student.username,
            student.displayName,
            lp.attendanceStatus,
            lp.materialId,
            lm.title
        )
          from LessonParticipantEntity lp
          join AppUserEntity student on student.id = lp.studentUserId
          left join LessonMaterialEntity lm on lm.id = lp.materialId
         where lp.lessonId in :lessonIds
         order by coalesce(student.displayName, student.username, student.keycloakSubject)
        """,
    )
    fun findParticipantRowsByLessonIds(lessonIds: Collection<UUID>): List<LessonParticipantRow>

    @Query(
        """
        select new com.playsay.gateway.repo.LessonParticipantRow(
            lp.lessonId,
            lp.studentUserId,
            student.keycloakSubject,
            student.username,
            student.displayName,
            lp.attendanceStatus,
            lp.materialId,
            lm.title
        )
          from LessonParticipantEntity lp
          join AppUserEntity student on student.id = lp.studentUserId
          left join LessonMaterialEntity lm on lm.id = lp.materialId
         where lp.lessonId = :lessonId
           and student.keycloakSubject = :subject
        """,
    )
    fun findParticipantRowByLessonIdAndSubject(lessonId: UUID, subject: String): LessonParticipantRow?

    @Query(
        """
        select distinct lp.materialId
          from LessonParticipantEntity lp
         where lp.lessonId = :lessonId
           and lp.materialId is not null
        """,
    )
    fun findAssignedMaterialIdsByLessonId(lessonId: UUID): List<UUID>

    @Query(
        """
        select count(lp)
          from LessonParticipantEntity lp
         where lp.lessonId = :lessonId
           and lp.materialId = :materialId
        """,
    )
    fun countByLessonIdAndMaterialId(lessonId: UUID, materialId: UUID): Long

    @Query(
        """
        select count(lp)
          from LessonParticipantEntity lp
          join AppUserEntity student on student.id = lp.studentUserId
         where lp.lessonId = :lessonId
           and student.keycloakSubject = :subject
        """,
    )
    fun countByLessonIdAndStudentSubject(lessonId: UUID, subject: String): Long

    @Query(
        """
        select lp
          from LessonParticipantEntity lp
          join LessonEntity l on l.id = lp.lessonId
          join AppUserEntity student on student.id = lp.studentUserId
         where l.livekitRoomName = :roomName
           and student.keycloakSubject = :subject
        """,
    )
    fun findByRoomNameAndStudentSubject(roomName: String, subject: String): LessonParticipantEntity?
}
