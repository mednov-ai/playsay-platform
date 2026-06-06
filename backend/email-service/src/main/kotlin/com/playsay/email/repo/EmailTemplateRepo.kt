package com.playsay.email.repo

import com.playsay.email.entity.EmailTemplateEntity
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface EmailTemplateRepo : JpaRepository<EmailTemplateEntity, UUID> {
    fun findByTemplateKeyAndLocaleAndEnabledTrue(templateKey: String, locale: String): EmailTemplateEntity?
}
