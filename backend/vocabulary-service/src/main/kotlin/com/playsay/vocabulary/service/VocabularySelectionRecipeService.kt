package com.playsay.vocabulary.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.dto.VocabularySelectionCriteriaRequest
import com.playsay.vocabulary.dto.VocabularySelectionRecipeRequest
import com.playsay.vocabulary.dto.VocabularySelectionRecipeResponse
import com.playsay.vocabulary.entity.VocabularySelectionRecipeEntity
import com.playsay.vocabulary.repo.VocabularySelectionRecipeRepo
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularySelectionRecipeService(
    private val recipes: VocabularySelectionRecipeRepo,
    private val objectMapper: ObjectMapper,
) {
    fun list(ownerSubject: String): List<VocabularySelectionRecipeResponse> =
        recipes.findAllByOwnerSubjectOrderByUpdatedAtDesc(ownerSubject).map(::response)

    fun get(ownerSubject: String, id: UUID): VocabularySelectionRecipeResponse = response(requireOwned(ownerSubject, id))

    fun create(ownerSubject: String, request: VocabularySelectionRecipeRequest): VocabularySelectionRecipeResponse {
        val now = Instant.now()
        val entity = VocabularySelectionRecipeEntity(ownerSubject = ownerSubject, createdAt = now, updatedAt = now)
        applyRequest(entity, request)
        return response(recipes.save(entity))
    }

    fun update(ownerSubject: String, id: UUID, request: VocabularySelectionRecipeRequest): VocabularySelectionRecipeResponse {
        val entity = requireOwned(ownerSubject, id)
        entity.revision += 1
        entity.updatedAt = Instant.now()
        applyRequest(entity, request)
        return response(recipes.save(entity))
    }

    fun delete(ownerSubject: String, id: UUID) {
        recipes.delete(requireOwned(ownerSubject, id))
    }

    fun resolveSettings(ownerSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticeSettingsRequest {
        val id = request.recipeId ?: return request
        val recipe = response(requireOwned(ownerSubject, id))
        return request.copy(
            mode = recipe.mode,
            wordLimit = recipe.wordLimit,
            pinnedEntryIds = (recipe.pinnedEntryIds + request.pinnedEntryIds).distinct(),
            excludedEntryIds = (recipe.excludedEntryIds + request.excludedEntryIds).distinct(),
            selection = request.selection ?: recipe.selection,
        )
    }

    private fun applyRequest(entity: VocabularySelectionRecipeEntity, request: VocabularySelectionRecipeRequest) {
        val cleanName = request.name.trim()
        if (recipes.existsByOwnerSubjectAndNameIgnoreCaseAndIdNot(entity.ownerSubject, cleanName, entity.id)) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "A vocabulary recipe with this name already exists.")
        }
        entity.name = cleanName
        entity.filtersJson = objectMapper.writeValueAsString(request.selection)
        entity.pinnedEntryIdsJson = objectMapper.writeValueAsString(request.pinnedEntryIds.distinct())
        entity.excludedEntryIdsJson = objectMapper.writeValueAsString(request.excludedEntryIds.distinct())
        entity.settingsJson = objectMapper.writeValueAsString(mapOf("mode" to request.mode.name, "wordLimit" to request.wordLimit))
    }

    private fun requireOwned(ownerSubject: String, id: UUID): VocabularySelectionRecipeEntity =
        recipes.findByIdAndOwnerSubject(id, ownerSubject)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary selection recipe was not found.")

    private fun response(entity: VocabularySelectionRecipeEntity): VocabularySelectionRecipeResponse {
        val settings = objectMapper.readValue(entity.settingsJson, object : TypeReference<Map<String, Any>>() {})
        return VocabularySelectionRecipeResponse(
            id = entity.id,
            name = entity.name,
            revision = entity.revision,
            selection = objectMapper.readValue(entity.filtersJson, VocabularySelectionCriteriaRequest::class.java),
            pinnedEntryIds = objectMapper.readValue(entity.pinnedEntryIdsJson, object : TypeReference<List<UUID>>() {}),
            excludedEntryIds = objectMapper.readValue(entity.excludedEntryIdsJson, object : TypeReference<List<UUID>>() {}),
            mode = com.playsay.vocabulary.dto.PracticeMode.valueOf(settings["mode"].toString()),
            wordLimit = (settings["wordLimit"] as Number).toInt(),
            createdAt = entity.createdAt,
            updatedAt = entity.updatedAt,
        )
    }
}
