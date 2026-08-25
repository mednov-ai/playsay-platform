package com.playsay.gateway.dto

import java.util.UUID

data class WorksheetSourceAttachmentResponse(
    val id: UUID,
    val sourceId: UUID,
    val pageId: UUID?,
    val sourcePageNumber: Int?,
    val kind: String,
    val fileName: String,
    val mimeType: String,
    val byteSize: Long,
)
