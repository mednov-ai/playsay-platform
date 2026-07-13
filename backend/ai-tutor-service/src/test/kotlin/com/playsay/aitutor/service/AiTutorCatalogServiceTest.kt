package com.playsay.aitutor.service

import com.playsay.aitutor.dto.AgePolicy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AiTutorCatalogServiceTest {
    private val catalog = AiTutorCatalogService()

    @Test
    fun `child catalog excludes adult work scenario and restricted persona`() {
        assertFalse(catalog.scenarios(AgePolicy.CHILD).any { it.id == "job-interview" })
        assertFalse(catalog.personas(AgePolicy.CHILD).any { it.id == "nova" })
        assertTrue(catalog.scenarios(AgePolicy.CHILD).any { it.id == "free" })
        assertTrue(catalog.scenarios(AgePolicy.CHILD).all { it.conversationGoal.isNotBlank() })
        assertTrue(catalog.scenarios(AgePolicy.CHILD).all { it.successCriteria.isNotEmpty() && it.turnGoals.isNotEmpty() })
    }

    @Test
    fun `adult catalog exposes one webp portrait per tutor voice`() {
        assertEquals(
            mapOf(
                "coral" to "/avatars/maya.webp",
                "verse" to "/avatars/leo.webp",
                "sage" to "/avatars/nova.webp",
            ),
            catalog.personas(AgePolicy.ADULT).associate { it.voice to it.avatarAsset },
        )
    }
}
