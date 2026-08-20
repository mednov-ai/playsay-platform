package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.VocabularyKeyItemResponse
import com.playsay.vocabulary.dto.VocabularyKeySetResponse
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.mapper.VocabularyPracticeResponseMapper
import com.playsay.vocabulary.mapper.toResponse
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import com.playsay.vocabulary.repo.VocabularyUserRepo
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyKeyboardQueryService(
    private val entries: VocabularyEntryRepo,
    private val users: VocabularyUserRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val responseMapper: VocabularyPracticeResponseMapper,
) {
    fun keySet(actorSubject: String, sessionId: UUID): VocabularyKeySetResponse {
        val session = sessions.findById(sessionId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (actorSubject != session.ownerSubject) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        val keyItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
            .filter { it.entryId != null && it.skill == VocabularySkill.SPELLING }
        val entryIds = keyItems.mapNotNull(VocabularyPracticeItemEntity::entryId).distinct()
        return VocabularyKeySetResponse(
            sessionId = session.id,
            title = users.findByKeycloakSubject(session.ownerSubject)?.let(responseMapper::displayLabel) ?: "Vocabulary",
            entries = entries.findAllById(entryIds).map { it.toResponse() },
            items = keyItems.mapNotNull { item ->
                val entryId = item.entryId ?: return@mapNotNull null
                val sourceText = responseMapper.snapshot(item)["sourceText"]?.takeIf(String::isNotBlank)
                    ?: item.answer.takeIf(String::isNotBlank)
                    ?: return@mapNotNull null
                VocabularyKeyItemResponse(item.id, entryId, sourceText)
            },
        )
    }
}
