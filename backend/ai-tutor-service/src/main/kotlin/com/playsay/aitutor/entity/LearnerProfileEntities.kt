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
    @Column(name = "username", length = 255)
    var username: String? = null,
    @Column(name = "display_name", length = 120)
    var displayName: String? = null,
    @Column(name = "managed_by_teacher_user_id")
    var managedByTeacherUserId: UUID? = null,
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

/** Read-only projection of active learner vocabulary owned by vocabulary-service. */
@Entity
@Table(name = "vocabulary_entries")
class LearnerVocabularyEntryEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "owner_subject", nullable = false) var ownerSubject: String = "",
    @Column(name = "source_text", nullable = false) var sourceText: String = "",
    @Column var translation: String? = null,
    @Column(nullable = false) var status: String = "ACTIVE",
    @Column(name = "updated_at", nullable = false) var updatedAt: java.time.Instant = java.time.Instant.EPOCH,
)

/** Read-only projection used to authorize teachers through their scheduled lessons. */
@Entity
@Table(name = "lesson")
class LearnerLessonEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "teacher_user_id") var teacherUserId: UUID? = null,
)

/** Read-only projection of the student side of a scheduled lesson. */
@Entity
@Table(name = "lesson_participant")
class LearnerLessonParticipantEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id", nullable = false) var lessonId: UUID = UUID.randomUUID(),
    @Column(name = "student_user_id", nullable = false) var studentUserId: UUID = UUID.randomUUID(),
)
