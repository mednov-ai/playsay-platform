package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "app_user")
class AppUserEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "keycloak_subject", nullable = false, unique = true, length = 255)
    var keycloakSubject: String = "",
    @Column(name = "username", length = 255)
    var username: String? = null,
    @Column(name = "email", length = 320)
    var email: String? = null,
    @Column(name = "name", length = 255)
    var name: String? = null,
    @Column(name = "roles", length = 255)
    var roles: String? = null,
    @Column(name = "display_name", length = 120)
    var displayName: String? = null,
    @Column(name = "avatar_url", length = 1024)
    var avatarUrl: String? = null,
    @Column(name = "locale", length = 16)
    var locale: String? = null,
    @Column(name = "country_code", length = 2)
    var countryCode: String? = null,
    @Column(name = "timezone", length = 64)
    var timezone: String? = null,
    @Column(name = "learning_goal", length = 500)
    var learningGoal: String? = null,
    @Column(name = "managed_by_teacher", nullable = false)
    var managedByTeacher: Boolean = false,
    @Column(name = "managed_by_teacher_user_id")
    var managedByTeacherUserId: UUID? = null,
    @Column(name = "roles_changed_at")
    var rolesChangedAt: Instant? = null,
    @Column(name = "deleted_at")
    var deletedAt: Instant? = null,
    @Column(name = "deleted_by_user_id")
    var deletedByUserId: UUID? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
