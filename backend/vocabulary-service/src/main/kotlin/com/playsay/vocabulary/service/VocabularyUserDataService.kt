package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticeAttemptRepo
import com.playsay.vocabulary.repo.VocabularyPracticePlanRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
import com.playsay.vocabulary.repo.VocabularyLearningEvidenceRepo
import com.playsay.vocabulary.repo.VocabularySelectionRecipeRepo
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyUserDataService(
    private val entries: VocabularyEntryRepo,
    private val skillStates: VocabularySkillStateRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val practices: VocabularyPracticeRepo,
    private val plans: VocabularyPracticePlanRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
    private val evidence: VocabularyLearningEvidenceRepo,
    private val recipes: VocabularySelectionRecipeRepo,
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
) {
    @Transactional
    fun purge(subject: String, presentedToken: String?) {
        if (serviceToken.isBlank() || presentedToken != serviceToken) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        removeSharedReferences(subject)
        recipes.deleteByOwnerSubject(subject)
        attempts.deleteByOwnerSubject(subject)
        evidence.deleteByOwnerSubject(subject)
        sessions.deleteByOwnerSubject(subject)
        // Creator identity is a historical reference, not ownership of every learner's results.
        // Deleting a shared practice here would cascade into other learners' sessions.
        skillStates.deleteByEntryOwnerSubject(subject)
        entries.deleteByOwnerSubject(subject)
    }

    private fun removeSharedReferences(subject: String) {
        plans.lockContainingSubject(subject).forEach { plan ->
            val payload = objectMapper.readTree(plan.payloadJson) as ObjectNode
            val original = payload.deepCopy()
            removeOwner(payload, "owners", subject)
            (payload.get("request") as? ObjectNode)?.let { settings -> removeSettingsOwner(settings, subject) }
            if (payload == original) return@forEach
            if ((payload.get("owners") as? ArrayNode)?.isEmpty == true && plan.publishedPracticeId == null) {
                plans.delete(plan)
                return@forEach
            }
            plan.payloadJson = objectMapper.writeValueAsString(payload)
            (objectMapper.readTree(plan.selectionReasonsJson) as? ObjectNode)?.let { reasons ->
                reasons.remove(subject)
                plan.selectionReasonsJson = objectMapper.writeValueAsString(reasons)
            }
            // Invalidate previously issued publish revisions after changing the selected scope.
            plan.revision += 1
        }
        practices.lockContainingSubject(subject).forEach { practice ->
            val settings = objectMapper.readTree(practice.settingsJson) as ObjectNode
            removeSettingsOwner(settings, subject)
            practice.settingsJson = objectMapper.writeValueAsString(settings)
        }
    }

    private fun removeSettingsOwner(settings: ObjectNode, subject: String) {
        (settings.get("ownerSubjects") as? ArrayNode)?.let { owners ->
            for (index in owners.size() - 1 downTo 0) if (owners[index].asText() == subject) owners.remove(index)
        }
        removeOwner(settings, "ownerOverrides", subject)
    }

    private fun removeOwner(node: ObjectNode, field: String, subject: String) {
        (node.get(field) as? ArrayNode)?.let { owners ->
            for (index in owners.size() - 1 downTo 0) {
                if (owners[index].get("ownerSubject")?.asText() == subject) owners.remove(index)
            }
        }
    }
}
