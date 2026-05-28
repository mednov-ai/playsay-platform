package com.playsay.gateway

import com.playsay.gateway.config.LocaleConfig
import com.playsay.gateway.error.ProjectExceptionHandler
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.MessageProvider
import com.playsay.gateway.utils.MetaData
import java.util.Locale
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.context.i18n.LocaleContextHolder
import org.springframework.context.support.ResourceBundleMessageSource
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest

class ProjectErrorLocalizationTest {
    private val handler = ProjectExceptionHandler(MessageProvider(messageSource()))

    @AfterTest
    fun resetLocale() {
        LocaleContextHolder.resetLocaleContext()
    }

    @Test
    fun `locale resolver reads supported accept language`() {
        val request = MockHttpServletRequest().apply {
            addHeader(HttpHeaders.ACCEPT_LANGUAGE, "de")
        }

        val locale = LocaleConfig().localeResolver().resolveLocale(request)

        assertEquals(Locale.GERMAN, locale)
    }

    @Test
    fun `locale resolver falls back to russian for unsupported accept language`() {
        val request = MockHttpServletRequest().apply {
            addHeader(HttpHeaders.ACCEPT_LANGUAGE, "it")
        }

        val locale = LocaleConfig().localeResolver().resolveLocale(request)

        assertEquals(Locale.forLanguageTag("ru"), locale)
    }

    @Test
    fun `localizes project error from locale context`() {
        LocaleContextHolder.setLocale(Locale.GERMAN)

        val response = handler.handleProjectResponseException(
            ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND),
        )

        assertEquals(HttpStatus.NOT_FOUND, response.statusCode)
        assertEquals(MetaData.ErrorCodes.COURSE_NOT_FOUND, response.body?.errorCode)
        assertEquals("Kurs nicht gefunden.", response.body?.message)
    }

    @Test
    fun `localizes russian project error from explicit russian bundle`() {
        LocaleContextHolder.setLocale(Locale.forLanguageTag("ru"))

        val response = handler.handleProjectResponseException(
            ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND),
        )

        assertEquals("Курс не найден.", response.body?.message)
    }

    @Test
    fun `project error falls back to russian bundle`() {
        LocaleContextHolder.setLocale(Locale.ITALIAN)

        val response = handler.handleProjectResponseException(
            ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COURSE_NOT_FOUND),
        )

        assertEquals("Курс не найден.", response.body?.message)
    }

    private fun messageSource(): ResourceBundleMessageSource =
        ResourceBundleMessageSource().apply {
            setBasename("messages")
            setDefaultEncoding("UTF-8")
            setFallbackToSystemLocale(false)
        }
}
