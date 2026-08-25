package com.playsay.worksheetimport.service

import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetPageDescriptor
import com.playsay.worksheetimport.domain.WorksheetSourceDescriptor
import com.playsay.worksheetimport.domain.WorksheetSourceKind
import com.playsay.worksheetimport.domain.WorksheetUploadRejection
import com.playsay.worksheetimport.domain.WorksheetUploadRejectionCode
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.HexFormat
import java.util.UUID
import org.springframework.stereotype.Component

class NormalizedWorksheetPacket internal constructor(
    val sessionId: UUID,
    val sources: List<WorksheetSourceDescriptor>,
    val pages: List<WorksheetPageDescriptor>,
    val rejected: List<WorksheetUploadRejection>,
    val sourceStoragePaths: Map<UUID, String>,
    val pageArtifacts: Map<UUID, WorksheetPageArtifact>,
    private val storage: WorksheetStagingStorage,
    private val storedKeys: Set<String>,
) : AutoCloseable {
    private var committed = false

    fun commit() {
        committed = true
    }

    override fun close() {
        if (!committed) storedKeys.forEach { key -> runCatching { storage.delete(key) } }
    }
}

data class WorksheetPageArtifact(
    val storagePath: String,
    val mimeType: String,
    val byteSize: Long,
    val checksumSha256: String,
)

@Component
class WorksheetPacketNormalizer(
    private val properties: WorksheetImportProperties,
    private val rasterizer: BoundedPdfRasterizer,
    private val storage: WorksheetStagingStorage,
) {
    fun normalize(sessionId: UUID, uploads: List<StagedWorksheetUpload>): NormalizedWorksheetPacket {
        val sources = mutableListOf<WorksheetSourceDescriptor>()
        val pages = mutableListOf<WorksheetPageDescriptor>()
        val rejected = mutableListOf<WorksheetUploadRejection>()
        val storedKeys = linkedSetOf<String>()
        val sourceStoragePaths = linkedMapOf<UUID, String>()
        val pageArtifacts = linkedMapOf<UUID, WorksheetPageArtifact>()
        try {
            uploads.sortedBy(StagedWorksheetUpload::sourceOrder).forEach { upload ->
                val sourceId = UUID.randomUUID()
                when (upload.kind) {
                    WorksheetSourceKind.IMAGE -> {
                        if (pages.size + 1 > properties.packet.maxPages) {
                            rejected += WorksheetUploadRejection(upload.fileName, WorksheetUploadRejectionCode.PACKET_TOO_LARGE)
                            return@forEach
                        }
                        val key = sourceKey(sessionId, sourceId)
                        storage.put(key, upload.path, upload.mimeType)
                        storedKeys += key
                        sourceStoragePaths[sourceId] = key
                        sources += upload.toDescriptor(sourceId)
                        val pageId = UUID.randomUUID()
                        pages += WorksheetPageDescriptor(
                            id = pageId,
                            sourceId = sourceId,
                            sourcePageNumber = null,
                            order = pages.size,
                            width = requireNotNull(upload.width),
                            height = requireNotNull(upload.height),
                            previewPath = key,
                        )
                        pageArtifacts[pageId] = WorksheetPageArtifact(key, upload.mimeType, upload.byteSize, upload.checksumSha256)
                    }
                    WorksheetSourceKind.PDF -> normalizePdf(
                        sessionId, sourceId, upload, sources, pages, rejected, storedKeys, sourceStoragePaths, pageArtifacts,
                    )
                }
            }
            return NormalizedWorksheetPacket(sessionId, sources, pages, rejected, sourceStoragePaths, pageArtifacts, storage, storedKeys)
        } catch (failure: Throwable) {
            storedKeys.forEach { key -> runCatching { storage.delete(key) } }
            throw failure
        }
    }

    @Suppress("LongParameterList")
    private fun normalizePdf(
        sessionId: UUID,
        sourceId: UUID,
        upload: StagedWorksheetUpload,
        sources: MutableList<WorksheetSourceDescriptor>,
        pages: MutableList<WorksheetPageDescriptor>,
        rejected: MutableList<WorksheetUploadRejection>,
        storedKeys: MutableSet<String>,
        sourceStoragePaths: MutableMap<UUID, String>,
        pageArtifacts: MutableMap<UUID, WorksheetPageArtifact>,
    ) {
        val rasterized = try {
            rasterizer.rasterize(upload.path)
        } catch (_: PdfRejectedException) {
            rejected += WorksheetUploadRejection(upload.fileName, WorksheetUploadRejectionCode.INVALID_PDF)
            return
        }
        rasterized.use { pdf ->
            if (pages.size + pdf.pages.size > properties.packet.maxPages) {
                rejected += WorksheetUploadRejection(upload.fileName, WorksheetUploadRejectionCode.PACKET_TOO_LARGE)
                return
            }
            val originalKey = sourceKey(sessionId, sourceId)
            storage.put(originalKey, upload.path, upload.mimeType)
            storedKeys += originalKey
            sourceStoragePaths[sourceId] = originalKey
            val descriptors = pdf.pages.map { raster ->
                val pageId = UUID.randomUUID()
                val key = pageKey(sessionId, sourceId, pageId)
                storage.put(key, raster.path, raster.mediaType)
                storedKeys += key
                pageArtifacts[pageId] = WorksheetPageArtifact(
                    key,
                    raster.mediaType,
                    Files.size(raster.path),
                    sha256(raster.path),
                )
                WorksheetPageDescriptor(
                    id = pageId,
                    sourceId = sourceId,
                    sourcePageNumber = raster.sourcePageNumber,
                    order = pages.size + raster.sourcePageNumber - 1,
                    width = raster.width,
                    height = raster.height,
                    previewPath = key,
                )
            }
            sources += upload.toDescriptor(sourceId)
            pages += descriptors
        }
    }

    private fun StagedWorksheetUpload.toDescriptor(sourceId: UUID) = WorksheetSourceDescriptor(
        id = sourceId,
        order = sourceOrder,
        kind = kind,
        fileName = fileName,
        mimeType = mimeType,
        byteSize = byteSize,
        checksumSha256 = checksumSha256,
    )

    private fun sourceKey(sessionId: UUID, sourceId: UUID) = "sessions/$sessionId/sources/$sourceId/original"
    private fun pageKey(sessionId: UUID, sourceId: UUID, pageId: UUID) = "sessions/$sessionId/sources/$sourceId/pages/$pageId"
}

@Component
class WorksheetPagePreviewService(
    private val storage: WorksheetStagingStorage,
) {
    fun readAuthorized(page: WorksheetPageDescriptor): WorksheetStagingContent = storage.get(page.previewPath)
}

internal fun sha256(path: Path): String {
    val digest = MessageDigest.getInstance("SHA-256")
    Files.newInputStream(path).use { input ->
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
        }
    }
    return HexFormat.of().formatHex(digest.digest())
}
