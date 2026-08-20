package com.playsay.gateway.service

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component

@Component
class MaterialReadAccessPolicy(
    private val materialCatalogService: LessonMaterialCatalogService,
    private val userProfileStore: UserProfileStore,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val assignmentAccessPolicy: AssignmentAccessPolicy,
    private val lessonRepo: LessonRepo,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun requireReadable(authentication: JwtAuthenticationToken, materialId: UUID): LessonMaterialRow {
        val material = materialCatalogService.find(materialId)
            ?: throw materialNotFound()
        if (!canRead(authentication, material)) {
            throw materialNotFound()
        }
        return material
    }

    fun canRead(authentication: JwtAuthenticationToken, material: LessonMaterialRow): Boolean {
        val currentUserId = materialCatalogService.currentUserIdIfNeeded(authentication)
        if (materialCatalogService.canRead(material, authentication, currentUserId)) {
            return true
        }
        if (material.status == MetaData.MaterialStatuses.ARCHIVED) {
            return false
        }
        if (assignmentAccessPolicy.canManageMaterial(authentication, material.id)) {
            return true
        }

        val studentUserId = userProfileStore.currentUserId(authentication)
        return assignmentRecipientRepo.countActiveMaterialRecipients(
            materialId = material.id,
            studentUserId = studentUserId,
            type = MetaData.AssignmentTypes.HOMEWORK,
            archivedStatus = MetaData.AssignmentStatuses.ARCHIVED,
        ) > 0 || lessonRepo.countActiveMaterialParticipant(
            materialId = material.id,
            subject = authentication.token.subject,
            accessStartsBy = lessonAccessStartsBy(clock.instant()),
            accessEndsAfter = lessonAccessEndsAfter(clock.instant()),
            excludedStatuses = expiredMaterialAccessStatuses,
        ) > 0
    }

    private fun materialNotFound(): ProjectResponseException =
        ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
}

private val expiredMaterialAccessStatuses = listOf(
    MetaData.LessonStatuses.CANCELLED,
    MetaData.LessonStatuses.COMPLETED,
)
