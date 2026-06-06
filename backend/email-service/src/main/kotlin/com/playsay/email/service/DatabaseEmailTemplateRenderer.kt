package com.playsay.email.service

import com.playsay.email.entity.EmailTemplateEntity
import com.playsay.email.repo.EmailTemplateRepo
import freemarker.template.Configuration
import freemarker.template.Template
import freemarker.template.TemplateExceptionHandler
import java.io.StringReader
import java.io.StringWriter
import org.springframework.stereotype.Component

@Component
class DatabaseEmailTemplateRenderer(
    private val repo: EmailTemplateRepo,
) : TransactionalEmailTemplateRenderer {
    private val freeMarker = Configuration(Configuration.VERSION_2_3_32).apply {
        defaultEncoding = "UTF-8"
        templateExceptionHandler = TemplateExceptionHandler.RETHROW_HANDLER
        logTemplateExceptions = false
        wrapUncheckedExceptions = true
    }

    override fun render(command: TransactionalEmailCommand): RenderedEmail {
        val locale = command.locale.normalizedLocale()
        val template = repo.findByTemplateKeyAndLocaleAndEnabledTrue(command.templateKey, locale)
            ?: repo.findByTemplateKeyAndLocaleAndEnabledTrue(command.templateKey, defaultLocale)
            ?: error("Unsupported email template: ${command.templateKey}")
        val model = command.model.filterValues { it != null } + mapOf("locale" to template.locale)

        return RenderedEmail(
            subject = template.renderPart("subject", template.subjectTemplate, model),
            textBody = template.renderPart("text", template.textTemplate, model),
            htmlBody = template.renderPart("html", template.htmlTemplate, model),
        )
    }

    private fun EmailTemplateEntity.renderPart(
        part: String,
        source: String,
        model: Map<String, String?>,
    ): String {
        val writer = StringWriter()
        Template("$templateKey:$locale:$part:v$version", StringReader(source), freeMarker)
            .process(model, writer)
        return writer.toString()
    }

    private fun String?.normalizedLocale(): String =
        when (this?.trim()?.lowercase()?.substringBefore("-")) {
            "en" -> "en"
            "de" -> "de"
            "fr" -> "fr"
            else -> defaultLocale
        }

    private companion object {
        const val defaultLocale = "ru"
    }
}
