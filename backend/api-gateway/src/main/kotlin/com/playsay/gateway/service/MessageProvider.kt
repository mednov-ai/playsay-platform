package com.playsay.gateway.service

import java.util.Locale
import org.springframework.context.MessageSource
import org.springframework.stereotype.Component

@Component
class MessageProvider(
    private val messageSource: MessageSource,
) {
    operator fun get(code: String): String =
        resolve(code, emptyArray<Any>())

    fun get(code: String, vararg args: Any): String =
        resolve(code, args)

    private fun resolve(code: String, args: Array<out Any>): String =
        messageSource.getMessage(code, args, Locale.forLanguageTag(defaultLocale))

    private companion object {
        const val defaultLocale = "ru"
    }
}
