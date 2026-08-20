package com.playsay.gateway.service.assignment

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

@Component
class AssignmentMaterialResolver(
    private val lessonMaterialRepo: LessonMaterialRepo,
) {
    fun require(materialId: UUID): LessonMaterialRow =
        available(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)

    fun available(materialId: UUID): LessonMaterialRow? =
        lessonMaterialRepo.findRowById(materialId)
            ?.takeIf { material -> material.status != MetaData.MaterialStatuses.ARCHIVED }

    fun requireAssignable(currentUserId: UUID, materialId: UUID, isAdmin: Boolean): LessonMaterialRow {
        val material = require(materialId)
        val canAssign = isAdmin ||
            material.ownerTeacherUserId == currentUserId ||
            (material.visibility == MetaData.MaterialVisibility.PUBLIC &&
                material.status == MetaData.MaterialStatuses.PUBLISHED)
        if (!canAssign) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return material
    }
}
