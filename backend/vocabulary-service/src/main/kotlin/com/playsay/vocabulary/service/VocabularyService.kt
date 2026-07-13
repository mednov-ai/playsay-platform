package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.*
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyOccurrenceEntity
import com.playsay.vocabulary.mapper.toResponse
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyUserRepo
import com.playsay.vocabulary.repo.VocabularyLessonParticipantRepo
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.text.Normalizer
import java.time.Instant
import java.util.Locale
import java.util.UUID

@Service
class VocabularyService(private val entries: VocabularyEntryRepo, private val users: VocabularyUserRepo, private val participants: VocabularyLessonParticipantRepo, private val translationProvider: TranslationProvider) {
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
        val ownerSubject = resolveOwner(subject, request)
        val sourceText = cleanSource(request.sourceText)
        val languages = languages(ownerSubject, request.sourceLanguage, request.targetLanguage)
        val normalized = normalize(sourceText)
        val now = Instant.now()
        val entry = entries.findByOwnerSubjectAndNormalizedSourceAndSourceLanguageAndTargetLanguage(ownerSubject, normalized, languages.first, languages.second)
            ?: VocabularyEntryEntity(ownerSubject = ownerSubject, sourceText = sourceText, normalizedSource = normalized, sourceLanguage = languages.first, targetLanguage = languages.second, createdBySubject = subject, createdAt = now, updatedAt = now)
        request.translation?.trim()?.takeIf { it.isNotEmpty() }?.let { entry.translation = it }
        entry.partOfSpeech = request.partOfSpeech?.trim()?.takeIf { it.isNotEmpty() } ?: entry.partOfSpeech
        entry.example = request.example?.trim()?.takeIf { it.isNotEmpty() } ?: entry.example
        entry.exampleTranslation = request.exampleTranslation?.trim()?.takeIf { it.isNotEmpty() } ?: entry.exampleTranslation
        entry.translationState = request.translationState ?: if (entry.translation != null) TranslationState.SUGGESTED else entry.translationState
        entry.status = EntryStatus.ACTIVE
        entry.updatedAt = now
        entry.occurrences.add(VocabularyOccurrenceEntity(entry = entry, sourceType = request.sourceType, lessonId = request.lessonId, assignmentId = request.assignmentId, materialId = request.materialId, blockId = request.blockId?.trim(), context = request.context?.trim(), addedBySubject = subject, createdAt = now))
        return entries.save(entry).toResponse()
    }

    @Transactional(readOnly = true)
    fun list(subject: String, query: String?): List<VocabularyEntryResponse> = entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(subject, EntryStatus.ACTIVE)
        .asSequence().filter { query.isNullOrBlank() || it.sourceText.contains(query, true) || it.translation?.contains(query, true) == true }.map { it.toResponse() }.toList()

    @Transactional(readOnly = true)
    fun practice(subject: String, limit: Int): VocabularyPracticeResponse = VocabularyPracticeResponse(list(subject, null).take(limit.coerceIn(1, 100)))

    @Transactional
    fun update(subject: String, id: UUID, request: UpdateVocabularyEntryRequest): VocabularyEntryResponse {
        val entry = entries.findByIdAndOwnerSubject(id, subject) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        request.translation?.trim()?.let { entry.translation = it.takeIf(String::isNotEmpty) }
        request.partOfSpeech?.trim()?.let { entry.partOfSpeech = it.takeIf(String::isNotEmpty) }
        request.example?.trim()?.let { entry.example = it.takeIf(String::isNotEmpty) }
        request.exampleTranslation?.trim()?.let { entry.exampleTranslation = it.takeIf(String::isNotEmpty) }
        request.translationState?.let { entry.translationState = it }
        request.status?.let { entry.status = it }
        entry.updatedAt = Instant.now()
        return entries.save(entry).toResponse()
    }

    fun archive(subject: String, id: UUID) { update(subject, id, UpdateVocabularyEntryRequest(status = EntryStatus.ARCHIVED)) }

    private fun languages(subject: String, source: String?, target: String?): Pair<String, String> {
        val locale = users.findByKeycloakSubject(subject)?.locale?.lowercase(Locale.ROOT)?.substringBefore('-')
        return cleanLanguage(source, "en") to cleanLanguage(target, locale?.takeIf { it in setOf("ru", "de", "fr") } ?: "ru")
    }

    private fun resolveOwner(actorSubject: String, request: CreateVocabularyEntryRequest): String {
        val owner = request.ownerSubject?.trim()?.takeIf { it.isNotEmpty() } ?: return actorSubject
        if (owner == actorSubject) return owner
        val actor = users.findByKeycloakSubject(actorSubject) ?: throw ResponseStatusException(HttpStatus.FORBIDDEN)
        if (actor.roles?.split(',')?.map(String::trim)?.none { it == "TEACHER" || it == "ADMIN" } != false) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        val lessonId = request.lessonId ?: throw ResponseStatusException(HttpStatus.FORBIDDEN)
        val target = users.findByKeycloakSubject(owner) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (!participants.existsByLessonIdAndStudentUserId(lessonId, target.id)) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        return owner
    }

    private fun cleanSource(value: String) = value.trim().replace(Regex("\\s+"), " ").take(240).also { if (it.isBlank()) throw ResponseStatusException(HttpStatus.BAD_REQUEST) }
    private fun cleanLanguage(value: String?, fallback: String) = value?.trim()?.lowercase(Locale.ROOT)?.takeIf { it.matches(Regex("[a-z]{2,3}(-[a-z]{2})?")) } ?: fallback
    private fun normalize(value: String) = Normalizer.normalize(value, Normalizer.Form.NFKC).lowercase(Locale.ROOT).trim().replace(Regex("\\s+"), " ")
}
