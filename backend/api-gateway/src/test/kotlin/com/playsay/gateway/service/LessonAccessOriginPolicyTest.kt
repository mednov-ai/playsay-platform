package com.playsay.gateway.service

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class LessonAccessOriginPolicyTest {
    private val policy = LessonAccessOriginPolicy(
        publicAppUrl = "https://online.honey.school/",
        publicAppRfUrl = "https://online.honeyschool.ru/",
    )

    @Test
    fun `accepts both exact production origins and keeps rf default`() {
        assertEquals("https://online.honeyschool.ru", policy.defaultOrigin)
        assertEquals("https://online.honeyschool.ru", policy.resolve("https://online.honeyschool.ru"))
        assertEquals("https://online.honey.school", policy.resolve("https://online.honey.school"))
        assertEquals("https://online.honeyschool.ru/l#abcdefghijklmnop", policy.compactUrl(policy.rfOrigin, "abcdefghijklmnop"))
        assertEquals("https://online.honey.school/auth/callback", policy.callback(policy.directOrigin))
    }

    @Test
    fun `rejects lookalike foreign and path-bearing origins`() {
        assertNull(policy.resolve("https://online.honeyschool.ru.example"))
        assertNull(policy.resolve("https://online.honey.school.evil"))
        assertNull(policy.resolve("https://online.honeyschool.ru/path"))
        assertNull(policy.resolve("https://user@online.honeyschool.ru"))
        assertNull(policy.resolve("http://online.honeyschool.ru"))
    }
}
