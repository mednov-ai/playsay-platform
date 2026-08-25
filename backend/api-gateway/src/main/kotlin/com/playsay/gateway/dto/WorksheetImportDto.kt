package com.playsay.gateway.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.util.UUID

data class WorksheetImportCreateRequest(
    @field:NotBlank @field:Size(max = 160) val title: String,
    @field:NotBlank @field:Size(max = 16) val language: String,
    @field:Pattern(regexp = "A1|A2|B1|B2|C1|C2") val cefrLevel: String,
    @field:NotBlank @field:Size(max = 1000) val sourceNote: String,
)

data class WorksheetMaterializeRequest(
    val expectedRevision: Long,
    val rightsConfirmed: Boolean,
)

data class WorksheetMaterializeResponse(val materialId: UUID)
