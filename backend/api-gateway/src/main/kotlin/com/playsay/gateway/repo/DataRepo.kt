package com.playsay.gateway.repo

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.AssignmentEntity
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
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository

interface AppUserRepo : JpaRepository<AppUserEntity, UUID>

interface StudentProfileRepo : JpaRepository<StudentProfileEntity, UUID>

interface TeacherProfileRepo : JpaRepository<TeacherProfileEntity, UUID>

interface CourseRepo : JpaRepository<CourseEntity, UUID>

interface LessonTemplateRepo : JpaRepository<LessonTemplateEntity, UUID>

interface LessonRepo : JpaRepository<LessonEntity, UUID>

interface LessonParticipantRepo : JpaRepository<LessonParticipantEntity, UUID>

interface AssignmentRepo : JpaRepository<AssignmentEntity, UUID>

interface SubmissionRepo : JpaRepository<SubmissionEntity, UUID>

interface LessonMaterialRepo : JpaRepository<LessonMaterialEntity, UUID>

interface MaterialAssetRepo : JpaRepository<MaterialAssetEntity, UUID>

interface LessonMaterialAnnotationRepo : JpaRepository<LessonMaterialAnnotationEntity, UUID>

@Repository
class LegacyJdbcDataRepo(
    private val jdbcClient: JdbcClient,
) {
    fun sql(query: String): JdbcClient.StatementSpec =
        jdbcClient.sql(query)
}
