package com.playsay.gateway.repo

import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonParticipantEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

data class ScheduledLessonRow(
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
    val workMode: String,
    val livekitRoomName: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class LessonParticipantRow(
    val lessonId: UUID,
    val userId: UUID,
    val subject: String,
    val username: String?,
    val displayName: String?,
    val attendanceStatus: String?,
    val materialId: UUID?,
    val materialTitle: String?,
)

data class ScheduledMaterialLookupRow(
    val id: UUID,
    val status: String,
    val scheduledEnd: Instant?,
    val workMode: String,
    val materialId: UUID?,
)

interface LessonRepo : JpaRepository<LessonEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        """
        select l
          from LessonEntity l
         where l.id = :lessonId
        """,
    )
    fun lockById(lessonId: UUID): LessonEntity?

    @Query(
        """
        select new com.playsay.gateway.repo.ScheduledLessonRow(
            l.id,
            l.lessonTemplateId,
            coalesce(l.materialId, lt.materialId),
            lm.title,
            lt.courseId,
            c.title,
            lt.title,
            teacher.keycloakSubject,
            coalesce(teacher.displayName, teacher.name, teacher.username),
            l.scheduledStart,
            l.scheduledEnd,
            l.status,
            l.type,
            l.workMode,
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = case
              when l.workMode = 'PARALLEL' then null
              else coalesce(l.materialId, lt.materialId)
          end
          left join AppUserEntity teacher on teacher.id = l.teacherUserId
         order by case when l.scheduledStart is null then 1 else 0 end,
                  l.scheduledStart,
                  l.createdAt
        """,
    )
    fun findScheduleRowsForManager(): List<ScheduledLessonRow>

    @Query(
        """
        select new com.playsay.gateway.repo.ScheduledLessonRow(
            l.id,
            l.lessonTemplateId,
            coalesce(l.materialId, lt.materialId),
            lm.title,
            lt.courseId,
            c.title,
            lt.title,
            teacher.keycloakSubject,
            coalesce(teacher.displayName, teacher.name, teacher.username),
            l.scheduledStart,
            l.scheduledEnd,
            l.status,
            l.type,
            l.workMode,
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          join LessonParticipantEntity lpCurrent on lpCurrent.lessonId = l.id
          join AppUserEntity currentStudent on currentStudent.id = lpCurrent.studentUserId
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = coalesce(lpCurrent.materialId, l.materialId, lt.materialId)
          left join AppUserEntity teacher on teacher.id = l.teacherUserId
         where currentStudent.keycloakSubject = :subject
           and l.status not in :excludedStatuses
           and (l.scheduledEnd is null or l.scheduledEnd > :now)
         order by case when l.scheduledStart is null then 1 else 0 end,
                  l.scheduledStart,
                  l.createdAt
        """,
    )
    fun findScheduleRowsForStudent(
        subject: String,
        now: Instant,
        excludedStatuses: Collection<String>,
    ): List<ScheduledLessonRow>

    @Query(
        """
        select new com.playsay.gateway.repo.ScheduledLessonRow(
            l.id,
            l.lessonTemplateId,
            coalesce(l.materialId, lt.materialId),
            lm.title,
            lt.courseId,
            c.title,
            lt.title,
            teacher.keycloakSubject,
            coalesce(teacher.displayName, teacher.name, teacher.username),
            l.scheduledStart,
            l.scheduledEnd,
            l.status,
            l.type,
            l.workMode,
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = case
              when l.workMode = 'PARALLEL' then null
              else coalesce(l.materialId, lt.materialId)
          end
          left join AppUserEntity teacher on teacher.id = l.teacherUserId
         where l.id = :lessonId
        """,
    )
    fun findScheduleRowById(lessonId: UUID): ScheduledLessonRow?

    @Query(
        """
        select new com.playsay.gateway.repo.ScheduledLessonRow(
            l.id,
            l.lessonTemplateId,
            coalesce(lpCurrent.materialId, l.materialId, lt.materialId),
            lm.title,
            lt.courseId,
            c.title,
            lt.title,
            teacher.keycloakSubject,
            coalesce(teacher.displayName, teacher.name, teacher.username),
            l.scheduledStart,
            l.scheduledEnd,
            l.status,
            l.type,
            l.workMode,
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          join LessonParticipantEntity lpCurrent on lpCurrent.lessonId = l.id
          join AppUserEntity currentStudent on currentStudent.id = lpCurrent.studentUserId
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = coalesce(lpCurrent.materialId, l.materialId, lt.materialId)
          left join AppUserEntity teacher on teacher.id = l.teacherUserId
         where l.id = :lessonId
           and currentStudent.keycloakSubject = :subject
        """,
    )
    fun findScheduleRowByIdForStudent(lessonId: UUID, subject: String): ScheduledLessonRow?

    @Query(
        """
        select l
          from LessonEntity l
         where l.id = :lessonId
           and l.status not in :excludedStatuses
           and (l.scheduledEnd is null or l.scheduledEnd > :now)
        """,
    )
    fun findJoinableForManager(
        lessonId: UUID,
        now: Instant,
        excludedStatuses: Collection<String>,
    ): LessonEntity?

    @Query(
        """
        select l
          from LessonEntity l
         where l.id = :lessonId
           and l.status not in :excludedStatuses
           and (l.scheduledEnd is null or l.scheduledEnd > :now)
           and exists (
               select 1
                 from LessonParticipantEntity lp
                 join AppUserEntity student on student.id = lp.studentUserId
                where lp.lessonId = l.id
                  and student.keycloakSubject = :subject
           )
        """,
    )
    fun findJoinableForStudent(
        lessonId: UUID,
        subject: String,
        now: Instant,
        excludedStatuses: Collection<String>,
    ): LessonEntity?

    @Query(
        """
        select l
          from LessonEntity l
         where l.livekitRoomName = :roomName
        """,
    )
    fun findByLivekitRoomName(roomName: String): LessonEntity?

    @Query(
        """
        select new com.playsay.gateway.repo.ScheduledMaterialLookupRow(
            l.id,
            l.status,
            l.scheduledEnd,
            l.workMode,
            case
                when l.workMode = 'PARALLEL' then null
                else coalesce(l.materialId, lt.materialId)
            end
        )
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
         where l.id = :lessonId
        """,
    )
    fun findScheduledMaterialLookup(lessonId: UUID): ScheduledMaterialLookupRow?

    @Query(
        """
        select new com.playsay.gateway.repo.ScheduledMaterialLookupRow(
            l.id,
            l.status,
            l.scheduledEnd,
            l.workMode,
            coalesce(lpCurrent.materialId, l.materialId, lt.materialId)
        )
          from LessonEntity l
          join LessonParticipantEntity lpCurrent on lpCurrent.lessonId = l.id
          join AppUserEntity currentStudent on currentStudent.id = lpCurrent.studentUserId
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
         where l.id = :lessonId
           and currentStudent.keycloakSubject = :subject
        """,
    )
    fun findScheduledMaterialLookupForStudent(lessonId: UUID, subject: String): ScheduledMaterialLookupRow?

    @Query(
        """
        select count(l)
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          join LessonParticipantEntity lp on lp.lessonId = l.id
          join AppUserEntity student on student.id = lp.studentUserId
         where coalesce(lp.materialId, l.materialId, lt.materialId) = :materialId
           and student.keycloakSubject = :subject
           and l.status not in :excludedStatuses
           and (l.scheduledEnd is null or l.scheduledEnd > :now)
        """,
    )
    fun countActiveMaterialParticipant(
        materialId: UUID,
        subject: String,
        now: Instant,
        excludedStatuses: Collection<String>,
    ): Long
}

interface LessonParticipantRepo : JpaRepository<LessonParticipantEntity, UUID> {
    fun deleteByLessonId(lessonId: UUID): Long

    fun findByLessonId(lessonId: UUID): List<LessonParticipantEntity>

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
