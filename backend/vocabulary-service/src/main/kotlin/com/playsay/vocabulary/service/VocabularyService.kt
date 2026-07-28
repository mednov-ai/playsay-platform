package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.*
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyOccurrenceEntity
import com.playsay.vocabulary.mapper.toResponse
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyUserRepo
import com.playsay.vocabulary.realtime.VocabularyEntryChangedEvent
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.text.Normalizer
import java.time.Instant
import java.util.Locale
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher

@Service
class VocabularyService(
    private val entries: VocabularyEntryRepo,
    private val users: VocabularyUserRepo,
    private val access: VocabularyAccessService,
    private val translationProvider: TranslationProvider,
    private val eventPublisher: ApplicationEventPublisher,
) {
    fun suggest(subject: String, request: TranslationSuggestionRequest): TranslationSuggestionResponse {
        val languages = languages(subject, request.sourceLanguage, request.targetLanguage)
        return translationProvider.suggest(
            cleanSource(request.sourceText),
            languages.first,
            languages.second,
            request.context?.trim()?.takeIf(String::isNotEmpty),
            request.instruction?.trim()?.takeIf(String::isNotEmpty),
            request.previousTranslations.map(String::trim).filter(String::isNotEmpty).distinct().take(8),
        )
    }

    @Transactional
    fun create(subject: String, request: CreateVocabularyEntryRequest): VocabularyEntryResponse {
        val ownerSubject = access.requireOwnerAccess(
            subject,
            request.ownerSubject?.trim()?.takeIf(String::isNotEmpty) ?: subject,
            request.lessonId,
        )
        val sourceText = cleanSource(request.sourceText)
        val languages = languages(ownerSubject, request.sourceLanguage, request.targetLanguage)
        val normalized = normalize(sourceText)
        val now = Instant.now()
        val existing = entries.findByOwnerSubjectAndNormalizedSourceAndSourceLanguageAndTargetLanguage(ownerSubject, normalized, languages.first, languages.second)
        val entry = existing
            ?: VocabularyEntryEntity(ownerSubject = ownerSubject, sourceText = sourceText, normalizedSource = normalized, sourceLanguage = languages.first, targetLanguage = languages.second, createdBySubject = subject, createdAt = now, updatedAt = now)
        request.translation?.trim()?.takeIf { it.isNotEmpty() }?.let { entry.translation = it }
        entry.partOfSpeech = request.partOfSpeech?.trim()?.takeIf { it.isNotEmpty() } ?: entry.partOfSpeech
        entry.example = request.example?.trim()?.takeIf { it.isNotEmpty() } ?: entry.example
        entry.exampleTranslation = request.exampleTranslation?.trim()?.takeIf { it.isNotEmpty() } ?: entry.exampleTranslation
        entry.translationState = request.translationState ?: if (entry.translation != null) TranslationState.SUGGESTED else entry.translationState
        entry.status = EntryStatus.ACTIVE
        entry.updatedAt = now
        entry.occurrences.add(VocabularyOccurrenceEntity(entry = entry, sourceType = request.sourceType, lessonId = request.lessonId, assignmentId = request.assignmentId, materialId = request.materialId, blockId = request.blockId?.trim(), context = request.context?.trim(), addedBySubject = subject, createdAt = now))
        val response = entries.save(entry).toResponse()
        eventPublisher.publishEvent(
            VocabularyEntryChangedEvent(
                type = if (existing == null) "vocabulary.entry.created" else "vocabulary.entry.updated",
                ownerSubject = ownerSubject,
                lessonId = request.lessonId,
                actorSubject = subject,
                entry = response,
            ),
        )
        return response
    }

    @Transactional(readOnly = true)
    fun list(
        subject: String,
        query: String?,
        ownerSubject: String? = null,
        lessonId: UUID? = null,
    ): List<VocabularyEntryResponse> {
        val owner = access.requireOwnerAccess(
            subject,
            ownerSubject?.trim()?.takeIf(String::isNotEmpty) ?: subject,
            lessonId,
        )
        return entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(owner, EntryStatus.ACTIVE)
        .asSequence().filter { query.isNullOrBlank() || it.sourceText.contains(query, true) || it.translation?.contains(query, true) == true }.map { it.toResponse() }.toList()
    }

    @Transactional(readOnly = true)
    fun overview(
        subject: String,
        ownerSubject: String?,
        lessonId: UUID?,
        limit: Int,
    ): VocabularyOverviewResponse {
        val owner = access.requireOwnerAccess(
            subject,
            ownerSubject?.trim()?.takeIf(String::isNotEmpty) ?: subject,
            lessonId,
        )
        val selection = selectVocabularyOverview(
            entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(owner, EntryStatus.ACTIVE),
            lessonId,
            limit.coerceIn(1, 10),
        )
        return VocabularyOverviewResponse(
            lessonEntries = selection.lessonEntries.map(VocabularyEntryEntity::toResponse),
            recentEntries = selection.recentEntries.map(VocabularyEntryEntity::toResponse),
        )
    }

    @Transactional(readOnly = true)
    fun practice(subject: String, limit: Int): VocabularyEntryPracticeResponse =
        VocabularyEntryPracticeResponse(list(subject, null).take(limit.coerceIn(1, 100)))

    @Transactional
    fun update(subject: String, id: UUID, request: UpdateVocabularyEntryRequest): VocabularyEntryResponse {
        return updateEntry(subject, id, request, "vocabulary.entry.updated")
    }

    @Transactional
    fun archive(subject: String, id: UUID) {
        updateEntry(
            subject,
            id,
            UpdateVocabularyEntryRequest(status = EntryStatus.ARCHIVED),
            "vocabulary.entry.archived",
        )
    }

    private fun updateEntry(
        subject: String,
        id: UUID,
        request: UpdateVocabularyEntryRequest,
        eventType: String,
    ): VocabularyEntryResponse {
        val entry = entries.findById(id).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        access.requireOwnerAccess(subject, entry.ownerSubject, null)
        request.translation?.trim()?.let { entry.translation = it.takeIf(String::isNotEmpty) }
        request.partOfSpeech?.trim()?.let { entry.partOfSpeech = it.takeIf(String::isNotEmpty) }
        request.example?.trim()?.let { entry.example = it.takeIf(String::isNotEmpty) }
        request.exampleTranslation?.trim()?.let { entry.exampleTranslation = it.takeIf(String::isNotEmpty) }
        request.translationState?.let { entry.translationState = it }
        request.status?.let { entry.status = it }
        request.practicePaused?.let { entry.practicePaused = it }
        entry.updatedAt = Instant.now()
        val response = entries.save(entry).toResponse()
        eventPublisher.publishEvent(
            VocabularyEntryChangedEvent(
                type = eventType,
                ownerSubject = entry.ownerSubject,
                lessonId = null,
                actorSubject = subject,
                entry = response,
            ),
        )
        return response
    }

    private fun languages(subject: String, source: String?, target: String?): Pair<String, String> {
        val locale = users.findByKeycloakSubject(subject)?.locale?.lowercase(Locale.ROOT)?.substringBefore('-')
        return cleanLanguage(source, "en") to cleanLanguage(target, locale?.takeIf { it in setOf("ru", "de", "fr") } ?: "ru")
    }

    private fun cleanSource(value: String) = value.trim().replace(Regex("\\s+"), " ").take(240).also { if (it.isBlank()) throw ResponseStatusException(HttpStatus.BAD_REQUEST) }
    private fun cleanLanguage(value: String?, fallback: String) = value?.trim()?.lowercase(Locale.ROOT)?.takeIf { it.matches(Regex("[a-z]{2,3}(-[a-z]{2})?")) } ?: fallback
    private fun normalize(value: String) = Normalizer.normalize(value, Normalizer.Form.NFKC).lowercase(Locale.ROOT).trim().replace(Regex("\\s+"), " ")
}

internal data class VocabularyOverviewSelection(
    val lessonEntries: List<VocabularyEntryEntity>,
    val recentEntries: List<VocabularyEntryEntity>,
)

internal fun selectVocabularyOverview(
    entries: List<VocabularyEntryEntity>,
    lessonId: UUID?,
    limit: Int,
): VocabularyOverviewSelection {
    val safeLimit = limit.coerceIn(1, 10)
    val lessonEntries = if (lessonId == null) {
        emptyList()
    } else {
        entries
            .mapNotNull { entry ->
                entry.occurrences
                    .asSequence()
                    .filter { occurrence -> occurrence.lessonId == lessonId }
                    .maxOfOrNull(VocabularyOccurrenceEntity::createdAt)
                    ?.let { occurredAt -> entry to occurredAt }
            }
            .sortedByDescending(Pair<VocabularyEntryEntity, Instant>::second)
            .map(Pair<VocabularyEntryEntity, Instant>::first)
            .take(safeLimit)
    }
    val lessonIds = lessonEntries.mapTo(mutableSetOf(), VocabularyEntryEntity::id)
    val recentEntries = entries
        .asSequence()
        .filterNot { entry -> entry.id in lessonIds }
        .sortedByDescending(VocabularyEntryEntity::updatedAt)
        .take(safeLimit - lessonEntries.size)
        .toList()
    return VocabularyOverviewSelection(lessonEntries, recentEntries)
}
