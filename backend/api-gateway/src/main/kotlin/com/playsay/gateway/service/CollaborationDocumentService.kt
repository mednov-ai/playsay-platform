package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.playsay.gateway.dto.CollaborationDocumentResponse
import com.playsay.gateway.dto.CollaborationTokenResponse
import com.playsay.gateway.dto.CreateCollaborationDocumentRequest
import com.playsay.gateway.dto.FinalizeCollaborationDocumentRequest
import com.playsay.gateway.dto.MaterialSubmissionResponse
import com.playsay.gateway.dto.SaveCollaborationSnapshotRequest
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.CollaborationDocumentEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.CollaborationDocumentRepo
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.repo.ScheduledMaterialLookupRow
import com.playsay.gateway.utils.MetaData
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Date
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class CollaborationTokenService(
    @param:Value("\${playsay.collaboration.websocket-url:/collab/ws}") private val websocketUrl: String,
    @param:Value("\${playsay.collaboration.token-secret:}") private val tokenSecret: String,
    @param:Value("\${playsay.collaboration.token-ttl-seconds:900}") private val tokenTtlSeconds: Long,
) {
    fun createToken(authentication: JwtAuthenticationToken, document: CollaborationDocumentEntity): CollaborationTokenResponse {
        val secretBytes = tokenSecret.trim().toByteArray(StandardCharsets.UTF_8)
        if (secretBytes.size < 32) {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.COLLABORATION_NOT_CONFIGURED)
        }

        val now = Instant.now()
        val expiresAt = now.plusSeconds(tokenTtlSeconds.coerceIn(60, 3_600))
        val claims = JWTClaimsSet.Builder()
            .issuer("playsay-api-gateway")
            .subject(authentication.token.subject)
            .claim("documentId", document.id.toString())
            .claim("lessonId", document.lessonId.toString())
            .claim("materialId", document.materialId.toString())
            .claim("studentUserId", document.studentUserId?.toString())
            .claim("documentKind", document.documentKind)
            .claim("scope", document.collaborationScope)
            .claim("yjsDocumentId", document.yjsDocumentId)
            .claim("room", document.yjsDocumentId)
            .notBeforeTime(Date.from(now.minusSeconds(5)))
            .expirationTime(Date.from(expiresAt))
            .build()
        val jwt = SignedJWT(
            JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(),
            claims,
        )
        jwt.sign(MACSigner(secretBytes))

        return CollaborationTokenResponse(
            documentId = document.id,
            yjsDocumentId = document.yjsDocumentId,
            websocketUrl = websocketUrl.trim().ifEmpty { "/collab/ws" },
            token = jwt.serialize(),
            expiresAt = expiresAt,
        )
    }
}

@Component
class CollaborationDocumentService(
    private val appUserRepo: AppUserRepo,
    private val collaborationDocumentRepo: CollaborationDocumentRepo,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val userProfileStore: UserProfileStore,
    private val lessonMaterialStore: LessonMaterialStore,
    private val tokenService: CollaborationTokenService,
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.collaboration.service-token:}") private val collaborationServiceToken: String,
) {
    @Transactional
    fun createCurrent(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: CreateCollaborationDocumentRequest,
    ): CollaborationDocumentResponse {
        val values = request.validated()
        accessibleScheduledMaterial(authentication, lessonId, values.materialId)
        val studentUserId = studentUserIdForCurrentDocument(authentication, values.scope)
        val existing = findCurrent(
            lessonId = lessonId,
            materialId = values.materialId,
            studentUserId = studentUserId,
            documentKind = values.documentKind,
            scope = values.scope,
        )
        if (existing != null) {
            return existing.toResponse(existing.studentUser())
        }

        val now = Instant.now()
        val document = collaborationDocumentRepo.saveAndFlush(
            CollaborationDocumentEntity(
                id = UUID.randomUUID(),
                lessonId = lessonId,
                materialId = values.materialId,
                studentUserId = studentUserId,
                documentKind = values.documentKind,
                collaborationScope = values.scope,
                yjsDocumentId = yjsDocumentId(lessonId, values.materialId, studentUserId, values.documentKind, values.scope),
                snapshotJson = null,
                snapshotStorageKey = null,
                version = 0,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return document.toResponse(document.studentUser())
    }

    @Transactional(readOnly = true)
    fun current(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        materialId: UUID,
        documentKind: String,
        scope: String,
    ): CollaborationDocumentResponse {
        val values = ValidatedCollaborationDocumentRequest(
            materialId = materialId,
            documentKind = documentKind.requiredClean("documentKind", 40),
            scope = scope.validatedScope(),
        )
        accessibleScheduledMaterial(authentication, lessonId, materialId)
        val studentUserId = studentUserIdForCurrentDocument(authentication, values.scope)
        return findCurrent(lessonId, materialId, studentUserId, values.documentKind, values.scope)
            ?.let { document -> document.toResponse(document.studentUser()) }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COLLABORATION_DOCUMENT_NOT_FOUND)
    }

    @Transactional(readOnly = true)
    fun list(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        materialId: UUID,
    ): List<CollaborationDocumentResponse> {
        accessibleScheduledMaterial(authentication, lessonId, materialId)
        val documents = collaborationDocumentRepo.findByLessonIdAndMaterialIdOrderByUpdatedAtDesc(lessonId, materialId)
        val usersById = documents.studentUsersById()
        if (authentication.canManageCollaboration()) {
            return documents.map { document -> document.toResponse(usersById[document.studentUserId]) }
        }

        val currentUserId = userProfileStore.currentUserId(authentication)
        return documents
            .filter { document ->
                document.collaborationScope == MetaData.CollaborationScopes.GROUP ||
                    (document.collaborationScope == MetaData.CollaborationScopes.INDIVIDUAL && document.studentUserId == currentUserId)
            }
            .map { document -> document.toResponse(usersById[document.studentUserId]) }
    }

    @Transactional
    fun saveSnapshot(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        documentId: UUID,
        request: SaveCollaborationSnapshotRequest,
    ): CollaborationDocumentResponse {
        val document = visibleDocument(authentication, lessonId, documentId)
        return saveSnapshot(document, request)
    }

    @Transactional
    fun saveSnapshotFromService(
        serviceToken: String?,
        lessonId: UUID,
        documentId: UUID,
        request: SaveCollaborationSnapshotRequest,
    ): CollaborationDocumentResponse {
        requireValidServiceToken(serviceToken)
        val document = collaborationDocumentRepo.findById(documentId).orElse(null)
            ?.takeIf { found -> found.lessonId == lessonId }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COLLABORATION_DOCUMENT_NOT_FOUND)
        return saveSnapshot(document, request)
    }

    private fun saveSnapshot(
        document: CollaborationDocumentEntity,
        request: SaveCollaborationSnapshotRequest,
    ): CollaborationDocumentResponse {
        validateSnapshot(request.snapshot)
        document.snapshotJson = objectMapper.writeValueAsString(request.snapshot)
        document.snapshotStorageKey = request.snapshotStorageKey?.trim()?.takeIf { key -> key.isNotEmpty() }
        document.version += 1
        document.updatedAt = Instant.now()
        val saved = collaborationDocumentRepo.save(document)
        return saved.toResponse(saved.studentUser())
    }

    @Transactional
    fun finalize(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        documentId: UUID,
        request: FinalizeCollaborationDocumentRequest,
    ): MaterialSubmissionResponse {
        val document = visibleDocument(authentication, lessonId, documentId)
        if (document.collaborationScope != MetaData.CollaborationScopes.INDIVIDUAL || document.studentUserId == null) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SCOPE_INVALID)
        }
        val snapshot = document.snapshotJson
            ?.let { value -> runCatching { objectMapper.readTree(value) }.getOrNull() }
            ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SNAPSHOT_INVALID)
        validateSnapshot(snapshot)
        return lessonMaterialStore.saveCollaborationSubmission(
            lessonId = lessonId,
            materialId = document.materialId,
            studentUserId = document.studentUserId!!,
            yjsDocumentId = document.yjsDocumentId,
            content = snapshot,
            submitted = request.submitted,
        )
    }

    @Transactional(readOnly = true)
    fun token(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        documentId: UUID,
    ): CollaborationTokenResponse {
        val document = visibleDocument(authentication, lessonId, documentId)
        return tokenService.createToken(authentication, document)
    }

    private fun accessibleScheduledMaterial(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        materialId: UUID,
    ): ScheduledMaterialLookupRow {
        val lookup = lessonRepo.findScheduledMaterialLookup(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        if (lookup.materialId != materialId) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        if (authentication.canManageCollaboration()) {
            return lookup
        }
        if (!lookup.isVisibleToParticipant(Instant.now()) || !isLessonParticipant(lessonId, authentication.token.subject)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
        return lookup
    }

    private fun visibleDocument(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        documentId: UUID,
    ): CollaborationDocumentEntity {
        val document = collaborationDocumentRepo.findById(documentId).orElse(null)
            ?.takeIf { found -> found.lessonId == lessonId }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COLLABORATION_DOCUMENT_NOT_FOUND)
        accessibleScheduledMaterial(authentication, lessonId, document.materialId)
        if (authentication.canManageCollaboration()) {
            return document
        }

        val currentUserId = userProfileStore.currentUserId(authentication)
        val canAccess = document.collaborationScope == MetaData.CollaborationScopes.GROUP ||
            (document.collaborationScope == MetaData.CollaborationScopes.INDIVIDUAL && document.studentUserId == currentUserId)
        if (!canAccess) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
        return document
    }

    private fun studentUserIdForCurrentDocument(authentication: JwtAuthenticationToken, scope: String): UUID? {
        if (scope == MetaData.CollaborationScopes.GROUP) {
            return null
        }
        if (authentication.canManageCollaboration()) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
        return userProfileStore.currentUserId(authentication)
    }

    private fun findCurrent(
        lessonId: UUID,
        materialId: UUID,
        studentUserId: UUID?,
        documentKind: String,
        scope: String,
    ): CollaborationDocumentEntity? =
        if (scope == MetaData.CollaborationScopes.GROUP) {
            collaborationDocumentRepo.findByLessonIdAndMaterialIdAndStudentUserIdIsNullAndDocumentKindAndCollaborationScope(
                lessonId = lessonId,
                materialId = materialId,
                documentKind = documentKind,
                collaborationScope = scope,
            )
        } else {
            collaborationDocumentRepo.findByLessonIdAndMaterialIdAndStudentUserIdAndDocumentKindAndCollaborationScope(
                lessonId = lessonId,
                materialId = materialId,
                studentUserId = requireNotNull(studentUserId),
                documentKind = documentKind,
                collaborationScope = scope,
            )
        }

    private fun CollaborationDocumentEntity.toResponse(studentUser: AppUserEntity?): CollaborationDocumentResponse =
        CollaborationDocumentResponse(
            id = id,
            lessonId = lessonId,
            materialId = materialId,
            studentUserId = studentUserId,
            studentSubject = studentUser?.keycloakSubject,
            studentName = studentUser?.displayName
                ?: studentUser?.name
                ?: studentUser?.username
                ?: studentUser?.keycloakSubject,
            documentKind = documentKind,
            scope = collaborationScope,
            yjsDocumentId = yjsDocumentId,
            snapshot = snapshotJson?.let { value -> objectMapper.readTree(value) },
            snapshotStorageKey = snapshotStorageKey,
            version = version,
            createdAt = createdAt,
            updatedAt = updatedAt,
        )

    private fun CollaborationDocumentEntity.studentUser(): AppUserEntity? =
        studentUserId?.let { userId -> appUserRepo.findById(userId).orElse(null) }

    private fun List<CollaborationDocumentEntity>.studentUsersById(): Map<UUID, AppUserEntity> {
        val ids = mapNotNull { document -> document.studentUserId }.distinct()
        if (ids.isEmpty()) {
            return emptyMap()
        }
        return appUserRepo.findByIdIn(ids).associateBy { user -> user.id }
    }

    private fun validateSnapshot(snapshot: JsonNode) {
        if (objectMapper.writeValueAsBytes(snapshot).size > 1_000_000) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SNAPSHOT_INVALID)
        }
    }

    private fun isLessonParticipant(lessonId: UUID, subject: String): Boolean =
        lessonParticipantRepo.countByLessonIdAndStudentSubject(lessonId, subject) > 0

    private fun requireValidServiceToken(serviceToken: String?) {
        val expected = collaborationServiceToken.trim()
        if (expected.length < 32) {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.COLLABORATION_NOT_CONFIGURED)
        }
        if (serviceToken?.trim() != expected) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
    }
}

private data class ValidatedCollaborationDocumentRequest(
    val materialId: UUID,
    val documentKind: String,
    val scope: String,
)

private fun CreateCollaborationDocumentRequest.validated(): ValidatedCollaborationDocumentRequest =
    ValidatedCollaborationDocumentRequest(
        materialId = materialId,
        documentKind = documentKind.requiredClean("documentKind", 40),
        scope = scope.validatedScope(),
    )

private fun String.validatedScope(): String {
    val cleaned = trim().uppercase()
    if (cleaned !in collaborationScopes) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SCOPE_INVALID)
    }
    return cleaned
}

private fun String.requiredClean(fieldName: String, maxLength: Int): String {
    val cleaned = trim().takeIf { value -> value.isNotEmpty() }
        ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, fieldName)
    if (cleaned.length > maxLength) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_TOO_LONG, fieldName, maxLength)
    }
    return cleaned.uppercase()
}

private fun yjsDocumentId(
    lessonId: UUID,
    materialId: UUID,
    studentUserId: UUID?,
    documentKind: String,
    scope: String,
): String =
    if (scope == MetaData.CollaborationScopes.GROUP) {
        "lesson:$lessonId:material:$materialId:group:kind:$documentKind"
    } else {
        "lesson:$lessonId:material:$materialId:student:${requireNotNull(studentUserId)}:kind:$documentKind"
    }

private fun JwtAuthenticationToken.canManageCollaboration(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN }

private fun ScheduledMaterialLookupRow.isVisibleToParticipant(now: Instant): Boolean =
    status !in expiredCollaborationLessonStatuses && scheduledEnd?.isAfter(now) != false

private val collaborationScopes = setOf(MetaData.CollaborationScopes.INDIVIDUAL, MetaData.CollaborationScopes.GROUP)
private val expiredCollaborationLessonStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
