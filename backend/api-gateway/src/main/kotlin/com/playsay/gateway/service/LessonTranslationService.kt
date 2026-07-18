package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.dto.LessonTranslationSessionResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.repo.StudentProfileRepo
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.HexFormat
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

data class TranslationCredential(
    val clientSecret: String,
    val expiresAt: Instant?,
    val model: String,
    val callsUrl: String,
)

interface LessonTranslationCredentialProvider {
    fun create(targetLanguage: String, safetyIdentifier: String): TranslationCredential
}

@Component
class OpenAiLessonTranslationCredentialProvider(
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.lesson-translation.enabled:false}") private val enabled: Boolean,
    @param:Value("\${playsay.lesson-translation.provider:stub}") private val provider: String,
    @param:Value("\${playsay.lesson-translation.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.lesson-translation.model:gpt-realtime-translate}") private val model: String,
    @Value("\${playsay.lesson-translation.base-url:https://api.openai.com/v1}") baseUrl: String,
) : LessonTranslationCredentialProvider {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build()
    private val cleanBaseUrl = baseUrl.trimEnd('/')

    override fun create(targetLanguage: String, safetyIdentifier: String): TranslationCredential {
        if (!enabled || provider != MetaData.AiProviders.OPENAI || apiKey.isBlank()) {
            unavailable()
        }

        val body = objectMapper.writeValueAsString(
            mapOf(
                "session" to mapOf(
                    "model" to model,
                    "audio" to mapOf("output" to mapOf("language" to targetLanguage)),
                ),
            ),
        )
        val request = HttpRequest.newBuilder(URI.create("$cleanBaseUrl/realtime/translations/client_secrets"))
            .timeout(Duration.ofSeconds(15))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .header("OpenAI-Safety-Identifier", safetyIdentifier)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()

        val response = try {
            httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        } catch (exception: Exception) {
            logger.warn("Lesson translation credential request failed: {}", exception.javaClass.simpleName)
            unavailable()
        }
        if (response.statusCode() !in 200..299) {
            logger.warn("Lesson translation credential request failed with HTTP {}", response.statusCode())
            unavailable()
        }

        val json = runCatching { objectMapper.readTree(response.body()) }.getOrElse {
            logger.warn("Lesson translation credential response was not valid JSON")
            unavailable()
        }
        val value = json.path("value").asText().ifBlank { json.path("client_secret").path("value").asText() }
        if (value.isBlank()) {
            logger.warn("Lesson translation credential response did not contain a client secret")
            unavailable()
        }
        val expiresEpoch = json.path("expires_at").asLong(json.path("client_secret").path("expires_at").asLong(0))
        return TranslationCredential(
            clientSecret = value,
            expiresAt = expiresEpoch.takeIf { it > 0 }?.let(Instant::ofEpochSecond),
            model = model,
            callsUrl = "$cleanBaseUrl/realtime/translations/calls",
        )
    }

    private fun unavailable(): Nothing =
        throw ProjectResponseException.localized(
            HttpStatus.SERVICE_UNAVAILABLE,
            MetaData.ErrorCodes.LESSON_TRANSLATION_PROVIDER_UNAVAILABLE,
        )
}

@Component
class LessonTranslationService(
    private val lessonRepo: LessonRepo,
    private val participantRepo: LessonParticipantRepo,
    private val studentProfileRepo: StudentProfileRepo,
    private val userRepo: AppUserRepo,
    private val credentials: LessonTranslationCredentialProvider,
) {
    @Transactional(readOnly = true)
    fun createSession(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): LessonTranslationSessionResponse {
        val lesson = lessonRepo.findById(lessonId).orElseThrow {
            ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }
        if (lesson.status != MetaData.LessonStatuses.IN_PROGRESS) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }
        if (lesson.type != MetaData.LessonTypes.INDIVIDUAL) {
            conflict(MetaData.ErrorCodes.LESSON_TRANSLATION_NOT_INDIVIDUAL)
        }

        val participants = participantRepo.findParticipantRowsByLessonIds(listOf(lessonId))
        if (participants.size != 1) {
            conflict(MetaData.ErrorCodes.LESSON_TRANSLATION_PARTICIPANTS_INVALID)
        }
        val participant = participants.single()
        val teacher = lesson.teacherUserId?.let(userRepo::findById)?.orElse(null)
            ?: conflict(MetaData.ErrorCodes.LESSON_TRANSLATION_PARTICIPANTS_INVALID)
        val student = userRepo.findById(participant.userId).orElse(null)
            ?: conflict(MetaData.ErrorCodes.LESSON_TRANSLATION_PARTICIPANTS_INVALID)
        val actorSubject = authentication.token.subject
        if (actorSubject != teacher.keycloakSubject && actorSubject != participant.subject) {
            throw ProjectResponseException.localized(
                HttpStatus.FORBIDDEN,
                MetaData.ErrorCodes.LESSON_TRANSLATION_ACCESS_DENIED,
            )
        }
        if (studentProfileRepo.findByUserId(student.id)?.lessonTranslationAllowed != true) {
            conflict(MetaData.ErrorCodes.LESSON_TRANSLATION_PERMISSION_REQUIRED)
        }

        val targetLanguage: String
        val sourceIdentity: String
        when (actorSubject) {
            teacher.keycloakSubject -> {
                targetLanguage = "en"
                sourceIdentity = participant.subject
            }
            participant.subject -> {
                targetLanguage = normalizeStudentLanguage(student.locale)
                sourceIdentity = teacher.keycloakSubject
            }
            else -> error("Translation participant access was validated before direction resolution")
        }

        val credential = credentials.create(targetLanguage, safetyIdentifier(actorSubject))
        return LessonTranslationSessionResponse(
            clientSecret = credential.clientSecret,
            expiresAt = credential.expiresAt,
            model = credential.model,
            callsUrl = credential.callsUrl,
            targetLanguage = targetLanguage,
            sourceParticipantIdentity = sourceIdentity,
        )
    }

    private fun normalizeStudentLanguage(locale: String?): String {
        val normalized = locale?.trim()?.lowercase()?.split('-', '_')?.firstOrNull().orEmpty()
        if (normalized == "en") conflict(MetaData.ErrorCodes.LESSON_TRANSLATION_NOT_REQUIRED)
        if (normalized !in supportedStudentLanguages) {
            conflict(MetaData.ErrorCodes.LESSON_TRANSLATION_LANGUAGE_UNAVAILABLE)
        }
        return normalized
    }

    private fun safetyIdentifier(subject: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest("playsay-lesson-translation:$subject".toByteArray(StandardCharsets.UTF_8))
        return HexFormat.of().formatHex(digest)
    }

    private fun conflict(errorCode: String): Nothing =
        throw ProjectResponseException.localized(HttpStatus.CONFLICT, errorCode)

    private companion object {
        val supportedStudentLanguages = setOf("ru", "de", "fr")
    }
}
