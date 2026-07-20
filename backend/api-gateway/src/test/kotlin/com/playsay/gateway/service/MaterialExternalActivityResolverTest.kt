package com.playsay.gateway.service

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class MaterialExternalActivityResolverTest {
    private val resolver = MaterialExternalActivityResolver()

    @Test
    fun `classifies all guaranteed providers`() {
        val cases = mapOf(
            "https://www.liveworksheets.com/worksheet/en/english-second-language-esl/808929#google_vignette" to "LIVEWORKSHEETS",
            "https://wordwall.net/ru/resource/59640205" to "WORDWALL",
            "https://en.islcollective.com/english-esl-video-lessons/ordering-food/617641" to "ISLCOLLECTIVE",
            "https://www.topworksheets.com/en/english-language/listening/there-is-there-are-lisntening-64106f5fa9cbb" to "TOPWORKSHEETS",
            "https://jeopardylabs.com/play/there-isare-and-prepositions-of-place" to "JEOPARDYLABS",
        )

        cases.forEach { (url, provider) ->
            val result = resolver.resolve(url)
            assertEquals(provider, result.provider)
            assertEquals("GUARANTEED", result.supportLevel)
        }
    }

    @Test
    fun `normalizes host and removes google vignette fragment`() {
        val result = resolver.resolve("  https://WORDWALL.NET/ru/resource/59640205#google_vignette  ")

        assertEquals("https://wordwall.net/ru/resource/59640205", result.normalizedUrl)
        assertEquals("wordwall.net", result.host)
        assertEquals(null, result.warningCode)
    }

    @Test
    fun `marks an unknown public https host experimental`() {
        val result = resolver.resolve("https://example.org/activity?id=7#round-2")

        assertEquals("EXPERIMENTAL", result.provider)
        assertEquals("EXPERIMENTAL", result.supportLevel)
        assertEquals("MATERIAL_EXTERNAL_ACTIVITY_EXPERIMENTAL_HOST", result.warningCode)
        assertEquals("https://example.org/activity?id=7#round-2", result.normalizedUrl)
    }

    @Test
    fun `rejects non https and credentialed urls`() {
        assertError("http://wordwall.net/resource/1", MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_HTTPS_REQUIRED)
        assertError("https://user:secret@example.org/activity", MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_URL_INVALID)
    }

    @Test
    fun `rejects local and private targets without fetching them`() {
        listOf(
            "https://localhost/activity",
            "https://lesson.local/activity",
            "https://127.0.0.1/activity",
            "https://10.0.0.4/activity",
            "https://172.16.1.2/activity",
            "https://192.168.4.5/activity",
            "https://169.254.169.254/latest/meta-data",
            "https://[::1]/activity",
        ).forEach { url ->
            assertError(url, MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_HOST_BLOCKED)
        }
    }

    @Test
    fun `rejects empty malformed and overlong urls`() {
        assertError("", MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_URL_INVALID)
        assertError("https://", MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_URL_INVALID)
        assertError("https://example.org/${"a".repeat(2_100)}", MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_URL_INVALID)
    }

    private fun assertError(url: String, errorCode: String) {
        val error = assertFailsWith<ProjectResponseException> { resolver.resolve(url) }
        assertEquals(errorCode, error.errorCode)
    }
}
