package com.playsay.aitutor.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.LocalDate
import java.util.UUID

/** Read-only projection of the application user used to enforce learner age policy. */
@Entity
@Table(name = "app_user")
class LearnerAppUserEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "keycloak_subject", nullable = false, unique = true, length = 255)
    var keycloakSubject: String = "",
    @Column(name = "roles", length = 255)
    var roles: String? = null,
)

/** Read-only projection of the student profile; writes remain owned by api-gateway. */
@Entity
@Table(name = "student_profile")
class LearnerStudentProfileEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "user_id", nullable = false, unique = true)
    var userId: UUID = UUID.randomUUID(),
    @Column(name = "birth_date")
    var birthDate: LocalDate? = null,
)
