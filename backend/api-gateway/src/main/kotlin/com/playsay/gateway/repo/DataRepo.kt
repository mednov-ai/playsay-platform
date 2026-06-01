package com.playsay.gateway.repo

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.CollaborationDocumentEntity
import com.playsay.gateway.entity.CourseEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonMaterialAnnotationEntity
import com.playsay.gateway.entity.LessonMaterialEntity
import com.playsay.gateway.entity.LessonParticipantEntity
import com.playsay.gateway.entity.LessonTemplateEntity
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.entity.StudentProfileEntity
import com.playsay.gateway.entity.SubmissionEntity
import com.playsay.gateway.entity.TeacherProfileEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

data class CourseSummaryRow(
    val course: CourseEntity,
    val lessonCount: Long,
)

data class CourseLessonRow(
    val id: UUID,
    val courseId: UUID?,
    val title: String,
    val orderIndex: Int?,
    val plannedDurationMin: Int?,
    val materialId: UUID?,
    val materialTitle: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

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
)

data class LessonMaterialRow(
    val id: UUID,
    val ownerTeacherUserId: UUID?,
    val ownerTeacherSubject: String?,
    val ownerTeacherName: String?,
    val title: String,
    val description: String?,
    val language: String,
    val cefrLevel: String,
    val visibility: String,
    val status: String,
    val document: String,
    val sourceMeta: String,
    val scoringRubric: String,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class MaterialSubmissionRow(
    val id: UUID,
    val assignmentId: UUID,
    val lessonId: UUID?,
    val materialId: UUID?,
    val userId: UUID,
    val userSubject: String?,
    val userName: String?,
    val content: String?,
    val score: java.math.BigDecimal?,
    val errorsCount: Int?,
    val submittedAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class ScheduledMaterialLookupRow(
    val id: UUID,
    val status: String,
    val scheduledEnd: Instant?,
    val materialId: UUID?,
)

interface AppUserRepo : JpaRepository<AppUserEntity, UUID> {
    fun findByKeycloakSubject(keycloakSubject: String): AppUserEntity?

    fun findByKeycloakSubjectIn(keycloakSubjects: Collection<String>): List<AppUserEntity>

    fun findByIdIn(ids: Collection<UUID>): List<AppUserEntity>

    @Query(
        """
        select u
          from AppUserEntity u
         order by coalesce(u.username, u.keycloakSubject)
        """,
    )
    fun findAllOrdered(): List<AppUserEntity>

    @Query(
        """
        select u
          from AppUserEntity u
         where u.roles like concat('%', :role, '%')
         order by coalesce(u.displayName, u.username, u.keycloakSubject)
        """,
    )
    fun findByRoleOrdered(role: String): List<AppUserEntity>
}

interface StudentProfileRepo : JpaRepository<StudentProfileEntity, UUID>

interface TeacherProfileRepo : JpaRepository<TeacherProfileEntity, UUID>

interface CourseRepo : JpaRepository<CourseEntity, UUID> {
    @Query(
        """
        select new com.playsay.gateway.repo.CourseSummaryRow(c, count(lt.id))
          from CourseEntity c
          left join LessonTemplateEntity lt on lt.courseId = c.id
         group by c
         order by c.createdAt desc, c.title
        """,
    )
    fun findCourseSummaries(): List<CourseSummaryRow>

    @Query(
        """
        select new com.playsay.gateway.repo.CourseSummaryRow(c, count(lt.id))
          from CourseEntity c
          left join LessonTemplateEntity lt on lt.courseId = c.id
         where c.isPublished = true
         group by c
         order by c.createdAt desc, c.title
        """,
    )
    fun findPublishedCourseSummaries(): List<CourseSummaryRow>

    @Query(
        """
        select new com.playsay.gateway.repo.CourseSummaryRow(c, count(lt.id))
          from CourseEntity c
          left join LessonTemplateEntity lt on lt.courseId = c.id
         where c.id = :courseId
         group by c
        """,
    )
    fun findCourseSummaryById(courseId: UUID): CourseSummaryRow?
}

interface LessonTemplateRepo : JpaRepository<LessonTemplateEntity, UUID> {
    fun deleteByCourseId(courseId: UUID): Long

    fun deleteByIdAndCourseId(id: UUID, courseId: UUID): Long

    fun findByIdAndCourseId(id: UUID, courseId: UUID): LessonTemplateEntity?

    @Query(
        """
        select new com.playsay.gateway.repo.CourseLessonRow(
            lt.id,
            lt.courseId,
            lt.title,
            lt.orderIndex,
            lt.plannedDurationMin,
            lt.materialId,
            lm.title,
            lt.createdAt,
            lt.updatedAt
        )
          from LessonTemplateEntity lt
          left join LessonMaterialEntity lm on lm.id = lt.materialId
         where lt.courseId = :courseId
         order by coalesce(lt.orderIndex, 2147483647), lt.createdAt, lt.title
        """,
    )
    fun findLessonRowsByCourseId(courseId: UUID): List<CourseLessonRow>

    @Query(
        """
        select new com.playsay.gateway.repo.CourseLessonRow(
            lt.id,
            lt.courseId,
            lt.title,
            lt.orderIndex,
            lt.plannedDurationMin,
            lt.materialId,
            lm.title,
            lt.createdAt,
            lt.updatedAt
        )
          from LessonTemplateEntity lt
          left join LessonMaterialEntity lm on lm.id = lt.materialId
         where lt.courseId = :courseId
           and lt.id = :lessonId
        """,
    )
    fun findLessonRowByCourseIdAndId(courseId: UUID, lessonId: UUID): CourseLessonRow?
}

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
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = coalesce(l.materialId, lt.materialId)
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
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = coalesce(l.materialId, lt.materialId)
          left join AppUserEntity teacher on teacher.id = l.teacherUserId
         where exists (
             select 1
               from LessonParticipantEntity lpFilter
               join AppUserEntity studentFilter on studentFilter.id = lpFilter.studentUserId
              where lpFilter.lessonId = l.id
                and studentFilter.keycloakSubject = :subject
         )
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
            l.livekitRoomName,
            l.createdAt,
            l.updatedAt
        )
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          left join CourseEntity c on c.id = lt.courseId
          left join LessonMaterialEntity lm on lm.id = coalesce(l.materialId, lt.materialId)
          left join AppUserEntity teacher on teacher.id = l.teacherUserId
         where l.id = :lessonId
        """,
    )
    fun findScheduleRowById(lessonId: UUID): ScheduledLessonRow?

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
            coalesce(l.materialId, lt.materialId)
        )
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
         where l.id = :lessonId
        """,
    )
    fun findScheduledMaterialLookup(lessonId: UUID): ScheduledMaterialLookupRow?

    @Query(
        """
        select count(l)
          from LessonEntity l
          left join LessonTemplateEntity lt on lt.id = l.lessonTemplateId
          join LessonParticipantEntity lp on lp.lessonId = l.id
          join AppUserEntity student on student.id = lp.studentUserId
         where coalesce(l.materialId, lt.materialId) = :materialId
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
            lp.attendanceStatus
        )
          from LessonParticipantEntity lp
          join AppUserEntity student on student.id = lp.studentUserId
         where lp.lessonId in :lessonIds
         order by coalesce(student.displayName, student.username, student.keycloakSubject)
        """,
    )
    fun findParticipantRowsByLessonIds(lessonIds: Collection<UUID>): List<LessonParticipantRow>

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

interface AssignmentRepo : JpaRepository<AssignmentEntity, UUID> {
    fun findFirstByLessonIdAndMaterialIdAndMaterialBlockIdIsNullAndTypeOrderByCreatedAtAsc(
        lessonId: UUID,
        materialId: UUID,
        type: String,
    ): AssignmentEntity?
}

interface SubmissionRepo : JpaRepository<SubmissionEntity, UUID> {
    fun findFirstByAssignmentIdAndLessonIdAndStudentUserIdOrderByUpdatedAtDesc(
        assignmentId: UUID,
        lessonId: UUID,
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
         where s.id = :submissionId
        """,
    )
    fun findMaterialSubmissionRowById(submissionId: UUID): MaterialSubmissionRow?
}

interface LessonMaterialRepo : JpaRepository<LessonMaterialEntity, UUID> {
    fun existsByIdAndStatusNot(id: UUID, status: String): Boolean

    @Query(
        """
        select count(m)
          from LessonMaterialEntity m
         where m.id = :materialId
           and m.status <> :archivedStatus
           and (
                 m.ownerTeacherUserId = :currentUserId
              or (m.visibility = :publicVisibility and m.status = :publishedStatus)
           )
        """,
    )
    fun countVisibleActiveForUser(
        materialId: UUID,
        currentUserId: UUID,
        archivedStatus: String,
        publicVisibility: String,
        publishedStatus: String,
    ): Long

    @Query(
        """
        select new com.playsay.gateway.repo.LessonMaterialRow(
            m.id,
            m.ownerTeacherUserId,
            owner.keycloakSubject,
            coalesce(owner.displayName, owner.name, owner.username),
            m.title,
            m.description,
            m.language,
            m.cefrLevel,
            m.visibility,
            m.status,
            m.document,
            m.sourceMeta,
            m.scoringRubric,
            m.createdAt,
            m.updatedAt
        )
          from LessonMaterialEntity m
          left join AppUserEntity owner on owner.id = m.ownerTeacherUserId
         where m.status <> :archivedStatus
         order by m.updatedAt desc, m.title
        """,
    )
    fun findRowsForAdmin(archivedStatus: String): List<LessonMaterialRow>

    @Query(
        """
        select new com.playsay.gateway.repo.LessonMaterialRow(
            m.id,
            m.ownerTeacherUserId,
            owner.keycloakSubject,
            coalesce(owner.displayName, owner.name, owner.username),
            m.title,
            m.description,
            m.language,
            m.cefrLevel,
            m.visibility,
            m.status,
            m.document,
            m.sourceMeta,
            m.scoringRubric,
            m.createdAt,
            m.updatedAt
        )
          from LessonMaterialEntity m
          left join AppUserEntity owner on owner.id = m.ownerTeacherUserId
         where m.status <> :archivedStatus
           and (
                 m.ownerTeacherUserId = :ownerTeacherUserId
              or (m.visibility = :publicVisibility and m.status = :publishedStatus)
           )
         order by case when m.ownerTeacherUserId = :ownerTeacherUserId then 0 else 1 end,
                  m.updatedAt desc,
                  m.title
        """,
    )
    fun findRowsForTeacher(
        ownerTeacherUserId: UUID,
        archivedStatus: String,
        publicVisibility: String,
        publishedStatus: String,
    ): List<LessonMaterialRow>

    @Query(
        """
        select new com.playsay.gateway.repo.LessonMaterialRow(
            m.id,
            m.ownerTeacherUserId,
            owner.keycloakSubject,
            coalesce(owner.displayName, owner.name, owner.username),
            m.title,
            m.description,
            m.language,
            m.cefrLevel,
            m.visibility,
            m.status,
            m.document,
            m.sourceMeta,
            m.scoringRubric,
            m.createdAt,
            m.updatedAt
        )
          from LessonMaterialEntity m
          left join AppUserEntity owner on owner.id = m.ownerTeacherUserId
         where m.visibility = :publicVisibility
           and m.status = :publishedStatus
         order by m.updatedAt desc, m.title
        """,
    )
    fun findPublicPublishedRows(publicVisibility: String, publishedStatus: String): List<LessonMaterialRow>

    @Query(
        """
        select new com.playsay.gateway.repo.LessonMaterialRow(
            m.id,
            m.ownerTeacherUserId,
            owner.keycloakSubject,
            coalesce(owner.displayName, owner.name, owner.username),
            m.title,
            m.description,
            m.language,
            m.cefrLevel,
            m.visibility,
            m.status,
            m.document,
            m.sourceMeta,
            m.scoringRubric,
            m.createdAt,
            m.updatedAt
        )
          from LessonMaterialEntity m
          left join AppUserEntity owner on owner.id = m.ownerTeacherUserId
         where m.id = :id
        """,
    )
    fun findRowById(id: UUID): LessonMaterialRow?
}

interface MaterialAssetRepo : JpaRepository<MaterialAssetEntity, UUID> {
    fun findByMaterialId(materialId: UUID): List<MaterialAssetEntity>

    fun findByMaterialIdOrderByCreatedAtDesc(materialId: UUID): List<MaterialAssetEntity>

    fun deleteByIdAndMaterialId(id: UUID, materialId: UUID): Long
}

interface LessonMaterialAnnotationRepo : JpaRepository<LessonMaterialAnnotationEntity, UUID> {
    fun findByLessonIdAndMaterialId(lessonId: UUID, materialId: UUID): LessonMaterialAnnotationEntity?
}

interface CollaborationDocumentRepo : JpaRepository<CollaborationDocumentEntity, UUID> {
    fun findByLessonIdAndMaterialIdAndStudentUserIdAndDocumentKindAndCollaborationScope(
        lessonId: UUID,
        materialId: UUID,
        studentUserId: UUID,
        documentKind: String,
        collaborationScope: String,
    ): CollaborationDocumentEntity?

    fun findByLessonIdAndMaterialIdAndStudentUserIdIsNullAndDocumentKindAndCollaborationScope(
        lessonId: UUID,
        materialId: UUID,
        documentKind: String,
        collaborationScope: String,
    ): CollaborationDocumentEntity?

    fun findByLessonIdAndMaterialIdOrderByUpdatedAtDesc(
        lessonId: UUID,
        materialId: UUID,
    ): List<CollaborationDocumentEntity>
}
