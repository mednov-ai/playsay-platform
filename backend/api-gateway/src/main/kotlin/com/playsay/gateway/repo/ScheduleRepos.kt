package com.playsay.gateway.repo

import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonEmailReminderEntity
import com.playsay.gateway.entity.LessonParticipantEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

data class ScheduledLessonRow(
    val id: UUID,
    val lessonTemplateId: UUID?,
    val inheritTemplateMaterial: Boolean,
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
    val recurrenceSeriesId: UUID?,
    val recurrenceIndex: Int?,
    val recurrenceTotal: Int?,
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
    val scheduledStart: Instant?,
    val scheduledEnd: Instant?,
    val workMode: String,
    val materialId: UUID?,
)

interface LessonRepo : JpaRepository<LessonEntity, UUID> {
    fun countByTeacherUserIdAndStatus(teacherUserId: UUID, status: String): Long

    fun findByTeacherUserId(teacherUserId: UUID): List<LessonEntity>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        """
        select l
          from LessonEntity l
         where l.id = :sourceId
            or l.recurrenceSeriesId = :sourceId
         order by l.recurrenceIndex
        """,
    )
    fun findByScheduleSourceId(sourceId: UUID): List<LessonEntity>

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
            l.inheritTemplateMaterial,
            case
                when l.materialId is not null then l.materialId
                when l.inheritTemplateMaterial = true then lt.materialId
                else null
            end,
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
            l.recurrenceSeriesId,
            l.recurrenceIndex,
            l.recurrenceTotal,
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = case
              when l.workMode = 'PARALLEL' then null
              when l.materialId is not null then l.materialId
              when l.inheritTemplateMaterial = true then lt.materialId
              else null
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
            l.inheritTemplateMaterial,
            coalesce(
                lpCurrent.materialId,
                case
                    when l.materialId is not null then l.materialId
                    when l.inheritTemplateMaterial = true then lt.materialId
                    else null
                end
            ),
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
            l.recurrenceSeriesId,
            l.recurrenceIndex,
            l.recurrenceTotal,
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          join LessonParticipantEntity lpCurrent on lpCurrent.lessonId = l.id
          join AppUserEntity currentStudent on currentStudent.id = lpCurrent.studentUserId
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = coalesce(
              lpCurrent.materialId,
              case
                  when l.materialId is not null then l.materialId
                  when l.inheritTemplateMaterial = true then lt.materialId
                  else null
              end
          )
          left join AppUserEntity teacher on teacher.id = l.teacherUserId
         where currentStudent.keycloakSubject = :subject
           and l.status not in :excludedStatuses
           and (l.scheduledEnd is null or l.scheduledEnd >= :visibleUntil)
         order by case when l.scheduledStart is null then 1 else 0 end,
                  l.scheduledStart,
                  l.createdAt
        """,
    )
    fun findScheduleRowsForStudent(
        subject: String,
        visibleUntil: Instant,
        excludedStatuses: Collection<String>,
    ): List<ScheduledLessonRow>

    @Query(
        """
        select new com.playsay.gateway.repo.ScheduledLessonRow(
            l.id,
            l.lessonTemplateId,
            l.inheritTemplateMaterial,
            case
                when l.materialId is not null then l.materialId
                when l.inheritTemplateMaterial = true then lt.materialId
                else null
            end,
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
            l.recurrenceSeriesId,
            l.recurrenceIndex,
            l.recurrenceTotal,
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = case
              when l.workMode = 'PARALLEL' then null
              when l.materialId is not null then l.materialId
              when l.inheritTemplateMaterial = true then lt.materialId
              else null
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
            l.inheritTemplateMaterial,
            coalesce(
                lpCurrent.materialId,
                case
                    when l.materialId is not null then l.materialId
                    when l.inheritTemplateMaterial = true then lt.materialId
                    else null
                end
            ),
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
            l.recurrenceSeriesId,
            l.recurrenceIndex,
            l.recurrenceTotal,
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          join LessonParticipantEntity lpCurrent on lpCurrent.lessonId = l.id
          join AppUserEntity currentStudent on currentStudent.id = lpCurrent.studentUserId
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = coalesce(
              lpCurrent.materialId,
              case
                  when l.materialId is not null then l.materialId
                  when l.inheritTemplateMaterial = true then lt.materialId
                  else null
              end
          )
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
           and l.scheduledStart is not null
           and l.scheduledStart <= :accessStartsBy
           and l.scheduledEnd is not null
           and l.scheduledEnd >= :accessEndsAfter
        """,
    )
    fun findJoinableForManager(
        lessonId: UUID,
        accessStartsBy: Instant,
        accessEndsAfter: Instant,
        excludedStatuses: Collection<String>,
    ): LessonEntity?

    @Query(
        """
        select l
          from LessonEntity l
         where l.id = :lessonId
           and l.status = :requiredStatus
           and l.scheduledStart is not null
           and l.scheduledStart <= :accessStartsBy
           and l.scheduledEnd is not null
           and l.scheduledEnd >= :accessEndsAfter
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
        accessStartsBy: Instant,
        accessEndsAfter: Instant,
        requiredStatus: String,
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
            l.scheduledStart,
            l.scheduledEnd,
            l.workMode,
            case
                when l.workMode = 'PARALLEL' then null
                when l.materialId is not null then l.materialId
                when l.inheritTemplateMaterial = true then lt.materialId
                else null
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
            l.scheduledStart,
            l.scheduledEnd,
            l.workMode,
            coalesce(
                lpCurrent.materialId,
                case
                    when l.materialId is not null then l.materialId
                    when l.inheritTemplateMaterial = true then lt.materialId
                    else null
                end
            )
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
         where coalesce(
                   lp.materialId,
                   case
                       when l.materialId is not null then l.materialId
                       when l.inheritTemplateMaterial = true then lt.materialId
                       else null
                   end
               ) = :materialId
           and student.keycloakSubject = :subject
           and l.status not in :excludedStatuses
           and l.scheduledStart is not null
           and l.scheduledStart <= :accessStartsBy
           and l.scheduledEnd is not null
           and l.scheduledEnd >= :accessEndsAfter
        """,
    )
    fun countActiveMaterialParticipant(
        materialId: UUID,
        subject: String,
        accessStartsBy: Instant,
        accessEndsAfter: Instant,
        excludedStatuses: Collection<String>,
    ): Long
}

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

interface LessonEmailReminderRepo : JpaRepository<LessonEmailReminderEntity, UUID> {
    fun deleteByLessonIdAndReminderTypeAndStatusIn(lessonId: UUID, reminderType: String, statuses: Collection<String>): Long

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from LessonEmailReminderEntity r where r.lessonId = :lessonId")
    fun deleteByLessonId(lessonId: UUID): Int

    fun existsByIdempotencyKey(idempotencyKey: String): Boolean

    fun findByLessonIdOrderByRecipientRoleAscRecipientUserIdAsc(lessonId: UUID): List<LessonEmailReminderEntity>

    fun findByLessonIdAndReminderTypeAndStatusIn(
        lessonId: UUID,
        reminderType: String,
        statuses: Collection<String>,
    ): List<LessonEmailReminderEntity>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        """
        select r
          from LessonEmailReminderEntity r
         where r.status = :status
           and r.dueAt <= :now
         order by r.dueAt, r.createdAt
        """,
    )
    fun findDue(status: String, now: Instant): List<LessonEmailReminderEntity>
}
