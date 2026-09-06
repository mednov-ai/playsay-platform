package com.playsay.registration.service

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ReturnToUrlPolicyTest {
    private val policy = ReturnToUrlPolicy()

    @Test
    fun `allows current dev and production application hosts`() {
        val urls = listOf(
            "https://dev.online.honey.school/lessons/lesson-id/classroom",
            "https://dev.key.honey.school/",
            "https://dev.online.honeyschool.ru/lessons/lesson-id/classroom",
            "https://dev.key.honeyschool.ru/",
            "https://online.honey.school/lessons/lesson-id/classroom",
            "https://key.honey.school/",
            "https://online.honeyschool.ru/lessons/lesson-id/classroom",
            "https://key.honeyschool.ru/",
        )

        urls.forEach { url ->
            assertEquals(url, policy.allow(url))
        }
    }

    @Test
    fun `rejects legacy and lookalike public hosts`() {
        listOf(
            "https://online.play-and-say.ru/",
            "https://key.play-and-say.ru/",
            "https://dev.online.honey.school.evil.example/",
            "https://subdomain.online.honey.school/",
            "https://online-honey.school/",
            "https://user@dev.online.honey.school/",
            "http://dev.online.honey.school/",
            "https://online.honey.school:443/",
            "https://online.honey.school:8443/",
            "ftp://online.honey.school/",
            "not a URL",
            "//online.honey.school/path",
        ).forEach { url ->
            assertNull(policy.allow(url))
        }
    }

    @Test
    fun `keeps localhost development callbacks`() {
        assertEquals("http://localhost:5173/auth/callback", policy.allow("http://localhost:5173/auth/callback"))
        assertEquals("http://127.0.0.1:5173/auth/callback", policy.allow("http://127.0.0.1:5173/auth/callback"))
    }
}
