package com.playsay.vocabulary.service

import com.playsay.vocabulary.config.VocabularyFeatureProperties
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.VocabularyEvidenceType
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyLearningEvidenceEntity
import com.playsay.vocabulary.entity.VocabularyProjectionQueueEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.repo.VocabularyLearningEvidenceRepo
import com.playsay.vocabulary.repo.VocabularyProjectionQueueRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.mockito.Mockito

class VocabularyMemoryProjectorTest {
    @Test
    fun `projection failure leaves replayable work without exposing learner content`() {
        val evidenceRepo = Mockito.mock(VocabularyLearningEvidenceRepo::class.java)
        val queueRepo = Mockito.mock(VocabularyProjectionQueueRepo::class.java)
        val states = Mockito.mock(VocabularySkillStateRepo::class.java)
        val meters = SimpleMeterRegistry()
        val entryId = UUID.randomUUID()
        val evidence = VocabularyLearningEvidenceEntity(
            ownerSubject = "learner",
            entryId = entryId,
            clientEvidenceId = "attempt-1",
            evidenceType = VocabularyEvidenceType.RETRIEVAL,
            skill = VocabularySkill.FORM,
            answerText = "private learner answer",
            rating = PracticeRating.GOOD,
            schedulerVersion = "broken-v1",
        )
        val queue = VocabularyProjectionQueueEntity(evidenceId = evidence.id, entryId = entryId, skill = VocabularySkill.FORM)
        val state = VocabularySkillStateEntity(entryId = entryId, ownerSubject = "learner", skill = VocabularySkill.FORM)
        val broken = object : VocabularySchedulingPolicy {
            override val version = "broken-v1"
            override fun apply(state: VocabularySkillStateEntity, input: VocabularySchedulingInput, now: Instant) {
                error("private learner answer must never be copied to diagnostics")
            }
        }
        Mockito.`when`(queueRepo.findById(queue.id)).thenReturn(Optional.of(queue))
        Mockito.`when`(evidenceRepo.findById(evidence.id)).thenReturn(Optional.of(evidence))
        Mockito.`when`(states.lockByEntryIdAndSkill(entryId, VocabularySkill.FORM)).thenReturn(state)
        Mockito.`when`(queueRepo.save(Mockito.any(VocabularyProjectionQueueEntity::class.java))).thenAnswer { it.arguments[0] }
        val projector = VocabularyMemoryProjector(
            evidenceRepo,
            queueRepo,
            states,
            VocabularySchedulingPolicyRegistry(listOf(broken), VocabularyFeatureProperties()),
            VocabularyPolicyShadowComparison(LegacyVocabularySchedulingPolicy(), AdaptiveVocabularySchedulingPolicy(), meters),
            meters,
        )

        val applied = projector.tryProject(queue.id)

        assertFalse(applied)
        assertEquals("PENDING", queue.status)
        assertEquals(1, queue.attemptCount)
        assertEquals("IllegalStateException", queue.lastError)
        assertNotNull(queue.nextAttemptAt)
        Mockito.verify(states, Mockito.never()).save(Mockito.any(VocabularySkillStateEntity::class.java))
    }
}
