package com.playsay.gateway.repo

import com.playsay.gateway.entity.MaterialSourceAttachmentEntity
import com.playsay.gateway.entity.WorksheetImportMaterialLinkEntity
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface WorksheetImportMaterialLinkRepository : JpaRepository<WorksheetImportMaterialLinkEntity, UUID> {
    fun findByMaterialId(materialId: UUID): WorksheetImportMaterialLinkEntity?
}

interface MaterialSourceAttachmentRepository : JpaRepository<MaterialSourceAttachmentEntity, UUID> {
    fun findAllByMaterialIdOrderByCreatedAtAsc(materialId: UUID): List<MaterialSourceAttachmentEntity>
    fun findByIdAndMaterialId(id: UUID, materialId: UUID): MaterialSourceAttachmentEntity?
}
