package com.playsay.gateway.repo

import com.playsay.gateway.entity.TeacherDelegationEntity
import com.playsay.gateway.entity.TeacherDelegationStudentEntity
import com.playsay.gateway.entity.UserDeletionOperationEntity
import com.playsay.gateway.entity.UserManagementAuditEntity
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

interface TeacherDelegationRepo : JpaRepository<TeacherDelegationEntity, UUID> {
    fun findAllByOrderByCreatedAtDesc(): List<TeacherDelegationEntity>
    fun findByPrimaryTeacherUserIdOrderByCreatedAtDesc(primaryTeacherUserId: UUID): List<TeacherDelegationEntity>
    fun findByDelegateTeacherUserIdOrderByCreatedAtDesc(delegateTeacherUserId: UUID): List<TeacherDelegationEntity>

    @Query(
        """
        select distinct d
          from TeacherDelegationEntity d, TeacherDelegationStudentEntity ds
         where ds.delegationId = d.id
           and ds.studentUserId = :studentUserId
           and d.delegateTeacherUserId = :delegateTeacherUserId
           and d.revokedAt is null
           and d.startsAt <= :at
           and d.endsAt > :at
        """,
    )
    fun findActiveAccess(
        delegateTeacherUserId: UUID,
        studentUserId: UUID,
        at: Instant,
    ): List<TeacherDelegationEntity>

    @Query(
        """
        select distinct d
          from TeacherDelegationEntity d, TeacherDelegationStudentEntity ds
         where ds.delegationId = d.id
           and ds.studentUserId = :studentUserId
           and d.revokedAt is null
           and d.startsAt <= :at
           and d.endsAt > :at
        """,
    )
    fun findActiveForStudent(studentUserId: UUID, at: Instant): List<TeacherDelegationEntity>

    @Query(
        """
        select distinct ds.studentUserId
          from TeacherDelegationEntity d, TeacherDelegationStudentEntity ds
         where ds.delegationId = d.id
           and d.delegateTeacherUserId = :delegateTeacherUserId
           and d.revokedAt is null
           and d.startsAt <= :at
           and d.endsAt > :at
        """,
    )
    fun findActiveStudentIds(delegateTeacherUserId: UUID, at: Instant): List<UUID>

    @Modifying
    @Query(
        """
        update TeacherDelegationEntity d
           set d.revokedAt = :at,
               d.revokedByUserId = :actorUserId
         where d.revokedAt is null
           and (d.primaryTeacherUserId = :teacherUserId or d.delegateTeacherUserId = :teacherUserId)
           and d.endsAt > :at
        """,
    )
    fun revokeForTeacher(teacherUserId: UUID, actorUserId: UUID, at: Instant): Int

    @Modifying
    @Query(
        """
        update TeacherDelegationEntity d
           set d.revokedAt = :at,
               d.revokedByUserId = :actorUserId
         where d.revokedAt is null
           and d.endsAt > :at
           and d.id in (
               select ds.delegationId from TeacherDelegationStudentEntity ds where ds.studentUserId = :studentUserId
           )
        """,
    )
    fun revokeForStudent(studentUserId: UUID, actorUserId: UUID, at: Instant): Int
}

interface TeacherDelegationStudentRepo : JpaRepository<TeacherDelegationStudentEntity, UUID> {
    fun findByDelegationIdIn(delegationIds: Collection<UUID>): List<TeacherDelegationStudentEntity>
    fun findByDelegationId(delegationId: UUID): List<TeacherDelegationStudentEntity>
}

interface UserManagementAuditRepo : JpaRepository<UserManagementAuditEntity, UUID>

interface UserDeletionOperationRepo : JpaRepository<UserDeletionOperationEntity, UUID> {
    fun findByIdAndRequestedByUserId(id: UUID, requestedByUserId: UUID): UserDeletionOperationEntity?
    fun findFirstByTargetSubjectOrderByCreatedAtDesc(targetSubject: String): UserDeletionOperationEntity?
}
