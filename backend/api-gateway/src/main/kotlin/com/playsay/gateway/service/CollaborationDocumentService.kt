package com.playsay.gateway.service

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
import com.playsay.gateway.dto.CreateParallelCollaborationDocumentRequest
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.CollaborationDocumentEntity
import com.playsay.gateway.entity.LessonParticipantEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.CollaborationDocumentRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.repo.ScheduledMaterialLookupRow
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.utils.requireSubject
import com.playsay.gateway.utils.toApplicationRoles
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
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
    @param:Value("\${playsay.collaboration.token-secret:}") private val tokenSecret: String,
    @param:Value("\${playsay.collaboration.token-ttl-seconds:900}") private val tokenTtlSeconds: Long,
    private val routingService: RegionalCollaborationRoutingService,
) {
    fun createToken(
        authentication: JwtAuthenticationToken,
        document: CollaborationDocumentEntity,
        origin: String?,
        canPublishMaterialViewport: Boolean,
        whiteboardId: UUID? = null,
        contentEpoch: Long? = null,
    ): CollaborationTokenResponse {
        val secretBytes = tokenSecret.trim().toByteArray(StandardCharsets.UTF_8)
        if (secretBytes.size < 32) {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.COLLABORATION_NOT_CONFIGURED)
        }
        val now = Instant.now()
        val expiresAt = now.plusSeconds(tokenTtlSeconds.coerceIn(60, 3_600))
        val claims = JWTClaimsSet.Builder()
            .issuer("playsay-api-gateway")
            .subject(authentication.token.requireSubject())
            .claim("documentId", document.id.toString())
            .claim("lessonId", document.lessonId.toString())
            .claim("materialId", document.materialId?.toString())
            .claim("whiteboardId", whiteboardId?.toString())
            .claim("contentEpoch", contentEpoch)
            .claim("gameLaunchId", document.gameLaunchId?.toString())
            .claim("studentUserId", document.studentUserId?.toString())
            .claim("documentKind", document.documentKind)
            .claim("scope", document.collaborationScope)
            .claim("yjsDocumentId", document.yjsDocumentId)
            .claim("room", document.yjsDocumentId)
            .claim("canPublishMaterialViewport", canPublishMaterialViewport)
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
            websocketUrl = routingService.websocketUrlFor(origin),
            token = jwt.serialize(),
            expiresAt = expiresAt,
        )
    }
}

@Component
@Suppress("LongParameterList")
class CollaborationDocumentService(
    private val appUserRepo: AppUserRepo,
    private val collaborationDocumentRepo: CollaborationDocumentRepo,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val userProfileStore: UserProfileStore,
    private val lessonAuthorizationService: ScheduledLessonAuthorizationService,
    private val admissionGuard: LessonAdmissionGuard,
    private val tokenService: CollaborationTokenService,
    private val objectMapper: ObjectMapper,
    private val gameAccess: com.playsay.gateway.service.game.LessonGameAccessService? = null,
    private val clock: Clock = Clock.systemUTC(),
    private val whiteboardAccess: WhiteboardAccessService,
    private val studentAccessPolicy: StudentAccessPolicy,
    @param:Value("\${playsay.collaboration.service-token:}") private val collaborationServiceToken: String,
) {
    @Transactional
    fun createCurrent(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: CreateCollaborationDocumentRequest,
    ): CollaborationDocumentResponse {
        val values = request.validated()
        if (values.documentKind == "LESSON_GAME") throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        lockLesson(lessonId)
        val lookup = accessibleScheduledMaterial(authentication, lessonId, values.materialId)
        requireParallelIndividual(lookup, values.scope)
        val studentUserId = studentUserIdForCurrentDocument(authentication, values.scope)
        return getOrCreateDocument(lessonId, values.materialId, studentUserId, values.documentKind, values.scope)
            .let { it.toResponse(it.studentUser()) }
    }

    @Transactional
    fun createParallelForStudent(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: CreateParallelCollaborationDocumentRequest,
    ): CollaborationDocumentResponse {
        if (!authentication.canManageCollaboration() || !lessonAuthorizationService.canManageLesson(authentication, lessonId)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
        lockLesson(lessonId)
        val lookup = accessibleScheduledMaterial(authentication, lessonId, request.materialId)
        if (lookup.workMode != MetaData.LessonWorkModes.PARALLEL) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }
        val subject = request.studentSubject.trim()
        if (subject.isEmpty()) throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, "studentSubject")
        if (subject.length > 255) throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_TOO_LONG, "studentSubject", 255)
        val participant = lessonParticipantRepo.findParticipantRowByLessonIdAndSubject(lessonId, subject)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        if ((participant.materialId ?: lookup.materialId) != request.materialId) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return getOrCreateDocument(lessonId, request.materialId, participant.userId, "MATERIAL_WORK", MetaData.CollaborationScopes.INDIVIDUAL)
            .let { it.toResponse(it.studentUser()) }
    }

    private fun getOrCreateDocument(
        lessonId: UUID,
        materialId: UUID,
        studentUserId: UUID?,
        documentKind: String,
        scope: String,
    ): CollaborationDocumentEntity {
        val existing = findCurrent(lessonId, materialId, studentUserId, documentKind, scope)
        if (existing != null) return existing
        val now = clock.instant()
        return collaborationDocumentRepo.saveAndFlush(
            CollaborationDocumentEntity(
                id = UUID.randomUUID(), lessonId = lessonId, materialId = materialId, studentUserId = studentUserId,
                documentKind = documentKind, collaborationScope = scope,
                yjsDocumentId = yjsDocumentId(lessonId, materialId, studentUserId, documentKind, scope),
                snapshotJson = null, snapshotStorageKey = null, version = 0, createdAt = now, updatedAt = now,
            ),
        )
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
        val lookup = accessibleScheduledMaterial(authentication, lessonId, materialId)
        requireParallelIndividual(lookup, values.scope)
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
        val lookup = accessibleScheduledMaterial(authentication, lessonId, materialId)
        val participants = if (lookup.workMode == MetaData.LessonWorkModes.PARALLEL) lessonParticipantRepo.findByLessonId(lessonId) else emptyList()
        val documents = collaborationDocumentRepo.findByLessonIdAndMaterialIdOrderByUpdatedAtDesc(lessonId, materialId)
            .filter { document -> isAllowedParallelDocument(lookup, document, participants) }
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

    @Transactional(readOnly = true)
    fun token(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        documentId: UUID,
        origin: String? = null,
    ): CollaborationTokenResponse {
        val document = visibleDocument(authentication, lessonId, documentId)
        val board = if (document.documentKind == "LESSON_WHITEBOARD") whiteboardAccess.boardForDocument(authentication, lessonId, documentId, true) else null
        return tokenService.createToken(
            authentication = authentication,
            document = document,
            origin = origin,
            canPublishMaterialViewport = board == null && lessonAuthorizationService.canManageLesson(authentication, lessonId) &&
                (document.documentKind == "LESSON_GAME" || lessonRepo.findById(lessonId).orElseThrow().workMode != MetaData.LessonWorkModes.PARALLEL),
            whiteboardId = board?.id,
            contentEpoch = board?.contentEpoch,
        )
    }

    @Transactional(readOnly = true)
    fun requireCurrentMaterialAccess(presentedToken: String?, documentId: UUID, subject: String) {
        requireMaterialServiceToken(presentedToken)
        val user = activeMaterialUser(subject)
        val document = collaborationDocumentRepo.findById(documentId).orElse(null)
            ?.takeIf { it.materialId != null && it.documentKind !in setOf("LESSON_GAME", "LESSON_WHITEBOARD") }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COLLABORATION_DOCUMENT_NOT_FOUND)
        val lesson = lessonRepo.findById(document.lessonId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val roster = lessonParticipantRepo.findByLessonId(lesson.id)
        val manager = canManageCurrentMaterial(user, lesson.teacherUserId, roster)
        if (admissionGuard.isKicked(lesson.id, subject)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
        val lookup = if (manager) lessonRepo.findScheduledMaterialLookup(lesson.id)
            else lessonRepo.findScheduledMaterialLookupForStudent(lesson.id, subject)
        if (lookup == null || !isAllowedParallelDocument(lookup, document, roster) ||
            !canAccessCurrentMaterial(user, document, roster, lookup, manager)
        ) throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
    }

    private fun requireMaterialServiceToken(presentedToken: String?) {
        val expected = collaborationServiceToken.trim().toByteArray(StandardCharsets.UTF_8)
        val presented = presentedToken?.trim()?.toByteArray(StandardCharsets.UTF_8) ?: byteArrayOf()
        if (expected.size < 32 || !MessageDigest.isEqual(expected, presented)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
    }

    private fun activeMaterialUser(subject: String): AppUserEntity {
        val user = appUserRepo.findByKeycloakSubject(subject)
            ?: throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        if (user.deletedAt != null || appUserRepo.hasDeletionIntent(subject)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
        return user
    }

    private fun canManageCurrentMaterial(user: AppUserEntity, teacherUserId: UUID?, roster: List<LessonParticipantEntity>): Boolean {
        val roles = user.roles.toApplicationRoles()
        return "ADMIN" in roles || ("TEACHER" in roles && (teacherUserId == user.id ||
            (roster.isNotEmpty() && studentAccessPolicy.canAccessEveryStudent(user.id, roster.map { it.studentUserId }))))
    }

    private fun canAccessCurrentMaterial(
        user: AppUserEntity, document: CollaborationDocumentEntity, roster: List<LessonParticipantEntity>,
        lookup: ScheduledMaterialLookupRow, manager: Boolean,
    ): Boolean =
        if (manager) {
            val materialIds = if (lookup.workMode == MetaData.LessonWorkModes.PARALLEL)
                roster.mapNotNull { it.materialId } + listOfNotNull(lookup.materialId)
            else listOfNotNull(lookup.materialId)
            document.materialId in materialIds
        } else {
            "STUDENT" in user.roles.toApplicationRoles() && roster.any { it.studentUserId == user.id } &&
                lookup.materialId == document.materialId && lookup.isVisibleToParticipant(clock.instant()) &&
                (document.collaborationScope == MetaData.CollaborationScopes.GROUP || document.studentUserId == user.id)
        }

    fun requireDocumentAccess(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        documentId: UUID,
    ) {
        visibleDocument(authentication, lessonId, documentId)
    }

    fun response(document: CollaborationDocumentEntity): CollaborationDocumentResponse =
        document.toResponse(document.studentUser())

    private fun accessibleScheduledMaterial(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        materialId: UUID,
    ): ScheduledMaterialLookupRow {
        if (admissionGuard.isKicked(lessonId, authentication)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
        if (authentication.canManageCollaboration()) {
            if (!lessonAuthorizationService.canManageLesson(authentication, lessonId)) {
                throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
            }
            val lookup = lessonRepo.findScheduledMaterialLookup(lessonId)
                ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
            val materialIds = if (lookup.workMode == MetaData.LessonWorkModes.PARALLEL) {
                lessonParticipantRepo.findAssignedMaterialIdsByLessonId(lessonId) + listOfNotNull(lookup.materialId)
            } else {
                listOfNotNull(lookup.materialId)
            }
            if (materialId !in materialIds) {
                throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
            }
            return lookup
        }

        val lookup = lessonRepo.findScheduledMaterialLookupForStudent(lessonId, authentication.token.requireSubject())
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        if (lookup.materialId != materialId) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        if (!lookup.isVisibleToParticipant(clock.instant()) || !isLessonParticipant(lessonId, authentication.token.requireSubject())) {
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
        if (document.documentKind == "LESSON_WHITEBOARD") {
            whiteboardAccess.boardForDocument(authentication, lessonId, documentId, true)
            return document
        }
        if (document.documentKind == "LESSON_GAME") {
            val access = requireNotNull(gameAccess)
            access.requireAccess(authentication, lessonId)
            access.requireActiveDocument(lessonId, documentId)
            return document
        }
        val lookup = accessibleScheduledMaterial(authentication, lessonId, requireNotNull(document.materialId))
        if (!isAllowedParallelDocument(lookup, document)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
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

    private fun requireParallelIndividual(lookup: ScheduledMaterialLookupRow, scope: String) {
        if (lookup.workMode == MetaData.LessonWorkModes.PARALLEL && scope != MetaData.CollaborationScopes.INDIVIDUAL) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
    }

    private fun isAllowedParallelDocument(
        lookup: ScheduledMaterialLookupRow,
        document: CollaborationDocumentEntity,
        participants: List<LessonParticipantEntity>? = null,
    ): Boolean {
        if (lookup.workMode != MetaData.LessonWorkModes.PARALLEL) return true
        if (document.collaborationScope != MetaData.CollaborationScopes.INDIVIDUAL || document.studentUserId == null) return false
        return (participants ?: lessonParticipantRepo.findByLessonId(lookup.id)).any {
            it.studentUserId == document.studentUserId && it.materialId == document.materialId
        }
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

    private fun isLessonParticipant(lessonId: UUID, subject: String): Boolean =
        lessonParticipantRepo.countByLessonIdAndStudentSubject(lessonId, subject) > 0

    private fun lockLesson(lessonId: UUID) {
        lessonRepo.lockById(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
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
        documentKind = documentKind.requiredClean("documentKind", 40).also {
            if (it == "LESSON_WHITEBOARD") throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SCOPE_INVALID)
        },
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
    isLessonInsideAccessWindow(
        status = status,
        scheduledStart = scheduledStart,
        scheduledEnd = scheduledEnd,
        accessExtensionSeconds = accessExtensionSeconds,
        now = now,
        closedStatuses = expiredCollaborationLessonStatuses,
    )

private val collaborationScopes = setOf(MetaData.CollaborationScopes.INDIVIDUAL, MetaData.CollaborationScopes.GROUP)
private val expiredCollaborationLessonStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
