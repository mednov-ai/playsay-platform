package com.playsay.gateway.service

import com.playsay.gateway.dto.MaterialDocumentPageManifestResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.io.ByteArrayOutputStream
import org.apache.pdfbox.Loader
import org.apache.pdfbox.cos.COSName
import org.springframework.http.HttpStatus

internal fun prepareMaterialPdf(source: ByteArray, maxPages: Int): PreparedMaterialDocument = try {
    Loader.loadPDF(source).use { document ->
        if (document.isEncrypted || document.numberOfPages !in 1..maxPages) {
            fail(
                if (document.numberOfPages > maxPages) MetaData.ErrorCodes.MATERIAL_DOCUMENT_LIMIT_EXCEEDED
                else MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE,
            )
        }
        val catalog = document.documentCatalog
        catalog.openAction = null
        catalog.actions = null
        catalog.acroForm = null
        catalog.names?.apply {
            embeddedFiles = null
            cosObject.removeItem(COSName.JAVA_SCRIPT)
        }
        val pages = document.pages.mapIndexed { index, page ->
            page.actions = null
            page.annotations.clear()
            MaterialDocumentPageManifestResponse(
                id = "page-${index + 1}",
                index = index,
                width = page.mediaBox.width.toDouble(),
                height = page.mediaBox.height.toDouble(),
            )
        }
        val output = ByteArrayOutputStream()
        document.save(output)
        PreparedMaterialDocument(
            format = MaterialDocumentFormat.PDF,
            mimeType = "application/pdf",
            extension = "pdf",
            originalFileName = null,
            sourceBytes = source,
            displayBytes = output.toByteArray(),
            revision = "",
            pages = pages,
        )
    }
} catch (exception: ProjectResponseException) {
    throw exception
} catch (exception: Exception) {
    fail(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID_FILE)
}

private fun fail(code: String): Nothing =
    throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, code)
