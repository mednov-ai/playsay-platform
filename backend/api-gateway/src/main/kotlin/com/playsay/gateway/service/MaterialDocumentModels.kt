package com.playsay.gateway.service

import com.playsay.gateway.dto.MaterialDocumentPageManifestResponse

enum class MaterialDocumentFormat { PDF, PPTX }

data class PreparedMaterialDocument(
    val format: MaterialDocumentFormat,
    val mimeType: String,
    val extension: String,
    val originalFileName: String?,
    val sourceBytes: ByteArray,
    val displayBytes: ByteArray,
    val revision: String,
    val pages: List<MaterialDocumentPageManifestResponse>,
)
