package com.playsay.email.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "email_templates")
class EmailTemplateEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "template_key", nullable = false, length = 120)
    var templateKey: String = "",
    @Column(name = "locale", nullable = false, length = 16)
    var locale: String = "ru",
    @Column(name = "subject_template", nullable = false, length = 255)
    var subjectTemplate: String = "",
    @Column(name = "text_template", nullable = false, columnDefinition = "TEXT")
    var textTemplate: String = "",
    @Column(name = "html_template", nullable = false, columnDefinition = "TEXT")
    var htmlTemplate: String = "",
    @Column(name = "version", nullable = false)
    var version: Int = 1,
    @Column(name = "enabled", nullable = false)
    var enabled: Boolean = true,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
