package com.playsay.gateway.client

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.dto.VocabularyAssignmentPreparationResponse
import com.playsay.gateway.dto.VocabularyAssignmentPreparationRequest
import com.playsay.gateway.dto.VocabularyHomeworkRequest
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class VocabularyAssignmentClient(
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.user-data.vocabulary-base-url:http://vocabulary-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.user-data.service-token:}")
    private val serviceToken: String,
) {
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(8))
        .build()

    fun prepare(
        actorSubject: String,
        assignmentId: java.util.UUID,
        ownerSubjects: List<String>,
        request: VocabularyHomeworkRequest,
    ): VocabularyAssignmentPreparationResponse {
        check(serviceToken.isNotBlank()) { "Vocabulary integration token is not configured" }
        val body = objectMapper.writeValueAsString(
            VocabularyAssignmentPreparationRequest(
                actorSubject = actorSubject,
                assignmentId = assignmentId,
                ownerSubjects = ownerSubjects,
                mode = request.mode,
                wordLimit = request.wordLimit,
                pinnedEntryIds = request.pinnedEntryIds,
                excludedEntryIds = request.excludedEntryIds,
                sourcePracticeId = request.sourcePracticeId,
                planId = request.planId,
                planRevision = request.planRevision,
            ),
        )
        val httpRequest = HttpRequest.newBuilder(
            URI.create(baseUrl.trimEnd('/') + "/internal/vocabulary/assignments"),
        )
            .timeout(Duration.ofSeconds(30))
            .header("Content-Type", "application/json")
            .header("X-PlaySay-Service-Token", serviceToken)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString())
        check(response.statusCode() in 200..299) {
            "Vocabulary assignment preparation failed with HTTP ${response.statusCode()}"
        }
        return objectMapper.readValue(response.body(), VocabularyAssignmentPreparationResponse::class.java)
    }
}
