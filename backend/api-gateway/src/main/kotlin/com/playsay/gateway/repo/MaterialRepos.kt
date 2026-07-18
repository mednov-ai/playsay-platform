package com.playsay.gateway.repo

import com.playsay.gateway.entity.LessonMaterialAnnotationEntity
import com.playsay.gateway.entity.LessonMaterialEntity
import com.playsay.gateway.entity.MaterialAssetEntity
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import jakarta.persistence.LockModeType

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
    val topicTags: String,
    val skillTags: String,
    val ageBand: String?,
    val estimatedDurationMin: Int?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

interface LessonMaterialRepo : JpaRepository<LessonMaterialEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select material from LessonMaterialEntity material where material.id = :materialId")
    fun lockById(materialId: UUID): LessonMaterialEntity?

    fun findByOwnerTeacherUserId(ownerTeacherUserId: UUID): List<LessonMaterialEntity>
    fun existsByIdAndStatusNot(id: UUID, status: String): Boolean

    fun findAllByStatusNot(status: String): List<LessonMaterialEntity>

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
            m.topicTags,
            m.skillTags,
            m.ageBand,
            m.estimatedDurationMin,
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
            m.topicTags,
            m.skillTags,
            m.ageBand,
            m.estimatedDurationMin,
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
            m.topicTags,
            m.skillTags,
            m.ageBand,
            m.estimatedDurationMin,
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
            m.topicTags,
            m.skillTags,
            m.ageBand,
            m.estimatedDurationMin,
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
