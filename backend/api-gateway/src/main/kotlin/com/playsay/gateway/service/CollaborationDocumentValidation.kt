package com.playsay.gateway.service

import com.playsay.gateway.dto.CreateCollaborationDocumentRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.http.HttpStatus

internal data class ValidatedCollaborationDocumentRequest(
    val materialId: UUID,
    val documentKind: String,
    val scope: String,
)

internal fun CreateCollaborationDocumentRequest.validated(): ValidatedCollaborationDocumentRequest =
    ValidatedCollaborationDocumentRequest(
        materialId = materialId,
        documentKind = documentKind.requiredCollaborationValue("documentKind", 40).also {
            if (it == "LESSON_WHITEBOARD") throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SCOPE_INVALID)
        },
        scope = scope.validatedScope(),
    )

internal fun String.validatedScope(): String {
    val cleaned = trim().uppercase()
    if (cleaned !in collaborationScopes) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SCOPE_INVALID)
    }
    return cleaned
}

internal fun String.requiredCollaborationValue(fieldName: String, maxLength: Int): String {
    val cleaned = trim().takeIf { value -> value.isNotEmpty() }
        ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, fieldName)
    if (cleaned.length > maxLength) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_TOO_LONG, fieldName, maxLength)
    }
    return cleaned.uppercase()
}

internal fun yjsDocumentId(
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

private val collaborationScopes = setOf(MetaData.CollaborationScopes.INDIVIDUAL, MetaData.CollaborationScopes.GROUP)
