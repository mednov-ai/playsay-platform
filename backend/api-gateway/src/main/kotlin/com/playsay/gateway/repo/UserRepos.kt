package com.playsay.gateway.repo

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.StudentProfileEntity
import com.playsay.gateway.entity.TeacherProfileEntity
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

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

interface StudentProfileRepo : JpaRepository<StudentProfileEntity, UUID> {
    fun findByUserId(userId: UUID): StudentProfileEntity?
    fun findByUserIdIn(userIds: Collection<UUID>): List<StudentProfileEntity>
}

interface TeacherProfileRepo : JpaRepository<TeacherProfileEntity, UUID>
