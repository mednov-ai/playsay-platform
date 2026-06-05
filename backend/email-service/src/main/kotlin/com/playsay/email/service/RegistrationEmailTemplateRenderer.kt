package com.playsay.email.service

import org.springframework.stereotype.Component

@Component
class RegistrationEmailTemplateRenderer : TransactionalEmailTemplateRenderer {
    override fun render(command: TransactionalEmailCommand): RenderedEmail {
        require(command.templateKey == registrationConfirmationTemplate) {
            "Unsupported email template: ${command.templateKey}"
        }
        val locale = command.locale.normalizedLocale()
        val confirmationUrl = command.model["confirmationUrl"]?.takeIf { it.isNotBlank() }
            ?: error("registration-confirmation requires confirmationUrl")
        val displayName = command.model["displayName"]?.takeIf { it.isNotBlank() }
        val greeting = when (locale) {
            "en" -> displayName?.let { "Hello, $it!" } ?: "Hello!"
            "de" -> displayName?.let { "Hallo, $it!" } ?: "Hallo!"
            "fr" -> displayName?.let { "Bonjour, $it !" } ?: "Bonjour !"
            else -> displayName?.let { "Здравствуйте, $it!" } ?: "Здравствуйте!"
        }
        val subject = when (locale) {
            "en" -> "Confirm your Play&Say account"
            "de" -> "Play&Say Konto bestätigen"
            "fr" -> "Confirmez votre compte Play&Say"
            else -> "Подтвердите аккаунт Play&Say"
        }
        val body = when (locale) {
            "en" -> "$greeting\n\nConfirm your email to finish creating your Play&Say student account:\n$confirmationUrl\n\nIf you did not request this, ignore this email."
            "de" -> "$greeting\n\nBestätigen Sie Ihre E-Mail-Adresse, um Ihr Play&Say Schülerkonto fertig einzurichten:\n$confirmationUrl\n\nFalls Sie dies nicht angefordert haben, ignorieren Sie diese E-Mail."
            "fr" -> "$greeting\n\nConfirmez votre adresse e-mail pour terminer la création de votre compte étudiant Play&Say :\n$confirmationUrl\n\nSi vous n'avez rien demandé, ignorez cet e-mail."
            else -> "$greeting\n\nПодтвердите email, чтобы завершить создание ученического аккаунта Play&Say:\n$confirmationUrl\n\nЕсли вы не запрашивали регистрацию, просто проигнорируйте письмо."
        }
        return RenderedEmail(subject = subject, textBody = body)
    }

    private fun String?.normalizedLocale(): String =
        when (this?.trim()?.lowercase()?.substringBefore("-")) {
            "en" -> "en"
            "de" -> "de"
            "fr" -> "fr"
            else -> "ru"
        }

    private companion object {
        const val registrationConfirmationTemplate = "registration-confirmation"
    }
}
