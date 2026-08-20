package com.playsay.gateway.service

import com.playsay.gateway.service.assignment.AssignmentStore

import com.playsay.gateway.dto.VocabularyAssignmentProgressUpdateRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class VocabularyAssignmentProgressService(
    private val assignments: AssignmentStore,
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
) {
    fun update(
        assignmentId: UUID,
        presentedToken: String?,
        request: VocabularyAssignmentProgressUpdateRequest,
    ) {
        if (serviceToken.isBlank() || presentedToken != serviceToken) {
            throw ProjectResponseException.localized(
                HttpStatus.FORBIDDEN,
                MetaData.ErrorCodes.INTERNAL_SERVICE_ACCESS_DENIED,
            )
        }
        assignments.updateVocabularyProgress(assignmentId, request)
    }
}
