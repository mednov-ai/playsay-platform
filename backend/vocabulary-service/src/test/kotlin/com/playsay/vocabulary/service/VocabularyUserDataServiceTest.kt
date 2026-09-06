package com.playsay.vocabulary.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticePlanEntity
import com.playsay.vocabulary.repo.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.mockito.Mockito.*

class VocabularyUserDataServiceTest {
    @Test fun `purge removes exact learner scope but preserves shared practices and other learners`() {
        val entries = mock(VocabularyEntryRepo::class.java)
        val skills = mock(VocabularySkillStateRepo::class.java)
        val sessions = mock(VocabularyPracticeSessionRepo::class.java)
        val practices = mock(VocabularyPracticeRepo::class.java)
        val plans = mock(VocabularyPracticePlanRepo::class.java)
        val attempts = mock(VocabularyPracticeAttemptRepo::class.java)
        val evidence = mock(VocabularyLearningEvidenceRepo::class.java)
        val recipes = mock(VocabularySelectionRecipeRepo::class.java)
        val mapper = jacksonObjectMapper()
        val shared = VocabularyPracticeEntity(createdBySubject = "teacher", settingsJson = """{"ownerSubjects":["learner","learner-other"],"wordLimit":12}""")
        val plan = VocabularyPracticePlanEntity(
            createdBySubject = "teacher",
            payloadJson = """{"owners":[{"ownerSubject":"learner","ownerName":"Remove"},{"ownerSubject":"learner-other","ownerName":"Keep"}],"request":{"ownerSubjects":["learner","learner-other"],"ownerOverrides":[{"ownerSubject":"learner"},{"ownerSubject":"learner-other"}]}}""",
            selectionReasonsJson = """{"learner":{},"learner-other":{"reason":"keep"}}""",
        )
        `when`(plans.lockContainingSubject("learner")).thenReturn(listOf(plan))
        `when`(practices.lockContainingSubject("learner")).thenReturn(listOf(shared))
        val sharedCleanup = VocabularySharedUserDataCleanup(practices, plans, mapper)
        val service = VocabularyUserDataService(entries, skills, sessions, attempts, evidence, recipes, sharedCleanup, "test-token")
        service.purge("learner", "test-token")
        val payload = mapper.readTree(plan.payloadJson)
        assertEquals("learner-other", payload["owners"].single()["ownerSubject"].asText())
        assertEquals("Keep", payload["owners"].single()["ownerName"].asText())
        assertEquals("learner-other", payload["request"]["ownerOverrides"].single()["ownerSubject"].asText())
        assertEquals(12, mapper.readTree(shared.settingsJson)["wordLimit"].asInt())
        assertEquals("learner-other", mapper.readTree(shared.settingsJson)["ownerSubjects"].single().asText())
        verify(sessions).deleteByOwnerSubject("learner")
        verify(practices, never()).deleteByCreatedBySubject(anyString())
        verify(practices, never()).clearSettingsContainingSubject(anyString())
        verify(plans, never()).deleteContainingSubject(anyString())
        service.purge("learner", "test-token")
        assertEquals(2L, plan.revision)
        service.purge("teacher", "test-token")
        verify(practices, never()).deleteByCreatedBySubject(anyString())
    }
}
