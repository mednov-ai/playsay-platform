package com.playsay.gateway.repo

import com.playsay.gateway.entity.CourseEntity
import com.playsay.gateway.entity.LessonTemplateEntity
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
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
