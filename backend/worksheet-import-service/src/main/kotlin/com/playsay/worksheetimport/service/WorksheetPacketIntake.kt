package com.playsay.worksheetimport.service

import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetSourceKind
import com.playsay.worksheetimport.domain.WorksheetUploadRejection
import com.playsay.worksheetimport.domain.WorksheetUploadRejectionCode
import io.micrometer.core.instrument.Metrics
import java.io.BufferedInputStream
import java.io.EOFException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files
import java.nio.file.Path
import java.security.DigestInputStream
import java.security.MessageDigest
import java.util.HexFormat
import org.springframework.stereotype.Component
import org.springframework.web.multipart.MultipartFile

data class StagedWorksheetUpload(
    val sourceOrder: Int,
    val fileName: String,
    val mimeType: String,
    val kind: WorksheetSourceKind,
    val byteSize: Long,
    val checksumSha256: String,
    val path: Path,
    val width: Int? = null,
    val height: Int? = null,
)

class WorksheetPacketIntakeResult(
    val accepted: List<StagedWorksheetUpload>,
    val rejected: List<WorksheetUploadRejection>,
    private val stagingDirectory: Path,
) : AutoCloseable {
    override fun close() {
        if (!Files.exists(stagingDirectory)) return
        Files.walk(stagingDirectory).use { paths ->
            paths.sorted(Comparator.reverseOrder()).forEach { path -> runCatching { Files.deleteIfExists(path) } }
        }
    }
}

@Component
class WorksheetPacketIntake(
    private val properties: WorksheetImportProperties,
) {
    @Suppress("CognitiveComplexMethod")
    fun inspect(files: List<MultipartFile>): WorksheetPacketIntakeResult {
        val directory = Files.createTempDirectory("worksheet-intake-")
        val accepted = mutableListOf<StagedWorksheetUpload>()
        val rejected = mutableListOf<WorksheetUploadRejection>()
        var packetBytes = 0L
        try {
            files.forEachIndexed { index, file ->
                val fileName = safeFileName(file.originalFilename, index)
                val declared = file.contentType?.lowercase()?.substringBefore(';')?.trim().orEmpty()
                val declaredKind = declaredKind(fileName, declared)
                if (declaredKind == null) {
                    rejected += WorksheetUploadRejection(fileName, WorksheetUploadRejectionCode.UNSUPPORTED_TYPE)
                    return@forEachIndexed
                }
                val limit = if (declaredKind == WorksheetSourceKind.PDF) properties.pdf.maxBytes else properties.packet.maxImageBytes
                val stagedPath = directory.resolve("source-$index.bin")
                val staged = runCatching { stage(file, stagedPath, limit) }.getOrElse { failure ->
                    Files.deleteIfExists(stagedPath)
                    rejected += WorksheetUploadRejection(fileName, rejectionFor(failure))
                    return@forEachIndexed
                }
                val detected = detect(stagedPath)
                if (detected == null || declaredKind != detected.kind || (declared.isNotEmpty() && declared !in detected.acceptedMimeTypes)) {
                    Files.deleteIfExists(stagedPath)
                    rejected += WorksheetUploadRejection(fileName, WorksheetUploadRejectionCode.CONTENT_MISMATCH)
                    return@forEachIndexed
                }
                if (packetBytes + staged.byteSize > properties.packet.maxBytes) {
                    Files.deleteIfExists(stagedPath)
                    rejected += WorksheetUploadRejection(fileName, WorksheetUploadRejectionCode.PACKET_TOO_LARGE)
                    return@forEachIndexed
                }
                val dimensions = if (detected.kind == WorksheetSourceKind.IMAGE) imageDimensions(stagedPath, detected.mimeType) else null
                if (detected.kind == WorksheetSourceKind.IMAGE && dimensions == null) {
                    Files.deleteIfExists(stagedPath)
                    rejected += WorksheetUploadRejection(fileName, WorksheetUploadRejectionCode.INVALID_IMAGE)
                    return@forEachIndexed
                }
                packetBytes += staged.byteSize
                accepted += StagedWorksheetUpload(
                    sourceOrder = index,
                    fileName = fileName,
                    mimeType = detected.mimeType,
                    kind = detected.kind,
                    byteSize = staged.byteSize,
                    checksumSha256 = staged.checksumSha256,
                    path = stagedPath,
                    width = dimensions?.first,
                    height = dimensions?.second,
                )
            }
            recordIntakeMetrics(accepted, rejected, packetBytes)
            return WorksheetPacketIntakeResult(accepted, rejected, directory)
        } catch (failure: Throwable) {
            WorksheetPacketIntakeResult(emptyList(), emptyList(), directory).close()
            throw failure
        }
    }

    private fun recordIntakeMetrics(
        accepted: List<StagedWorksheetUpload>,
        rejected: List<WorksheetUploadRejection>,
        packetBytes: Long,
    ) {
        accepted.groupingBy { it.kind }.eachCount().forEach { (kind, count) ->
            Metrics.counter("playsay.worksheet.import.sources.accepted", "kind", kind.name).increment(count.toDouble())
        }
        rejected.groupingBy { it.code }.eachCount().forEach { (code, count) ->
            Metrics.counter("playsay.worksheet.import.sources.rejected", "reason", code.name).increment(count.toDouble())
        }
        Metrics.summary("playsay.worksheet.import.packet.bytes").record(packetBytes.toDouble())
    }

    @Suppress("CognitiveComplexMethod")
    private fun stage(file: MultipartFile, target: Path, limit: Long): StagedBytes {
        if (file.isEmpty) throw EmptyUpload()
        val digest = MessageDigest.getInstance("SHA-256")
        var count = 0L
        file.inputStream.use { raw ->
            DigestInputStream(BufferedInputStream(raw), digest).use { input ->
                Files.newOutputStream(target).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        count += read
                        if (count > limit) throw OversizedUpload()
                        output.write(buffer, 0, read)
                    }
                }
            }
        }
        if (count == 0L) throw EmptyUpload()
        return StagedBytes(count, HexFormat.of().formatHex(digest.digest()))
    }

    private fun declaredKind(fileName: String, contentType: String): WorksheetSourceKind? = when {
        contentType == "application/pdf" || fileName.lowercase().endsWith(".pdf") -> WorksheetSourceKind.PDF
        contentType in imageMimeTypes || imageExtensions.any { fileName.lowercase().endsWith(it) } -> WorksheetSourceKind.IMAGE
        else -> null
    }

    private fun detect(path: Path): DetectedSource? {
        val header = ByteArray(16)
        val count = Files.newInputStream(path).use { it.read(header) }
        if (count >= 5 && header.copyOfRange(0, 5).contentEquals("%PDF-".toByteArray())) {
            return DetectedSource(WorksheetSourceKind.PDF, "application/pdf", setOf("application/pdf"))
        }
        if (count >= 8 && header.copyOfRange(0, 8).contentEquals(pngSignature)) {
            return DetectedSource(WorksheetSourceKind.IMAGE, "image/png", setOf("image/png"))
        }
        if (count >= 3 && header[0] == 0xff.toByte() && header[1] == 0xd8.toByte() && header[2] == 0xff.toByte()) {
            return DetectedSource(WorksheetSourceKind.IMAGE, "image/jpeg", setOf("image/jpeg", "image/jpg"))
        }
        if (count >= 12 && header.copyOfRange(0, 4).contentEquals("RIFF".toByteArray()) && header.copyOfRange(8, 12).contentEquals("WEBP".toByteArray())) {
            return DetectedSource(WorksheetSourceKind.IMAGE, "image/webp", setOf("image/webp"))
        }
        return null
    }

    private fun imageDimensions(path: Path, mimeType: String): Pair<Int, Int>? = runCatching {
        when (mimeType) {
            "image/png" -> pngDimensions(path)
            "image/jpeg" -> jpegDimensions(path)
            "image/webp" -> webpDimensions(path)
            else -> null
        }?.takeIf { (width, height) -> width > 0 && height > 0 && width.toLong() * height <= properties.pdf.maxPagePixels }
    }.getOrNull()

    private fun pngDimensions(path: Path): Pair<Int, Int> {
        val bytes = Files.newInputStream(path).use { input -> input.readNBytes(24) }
        if (bytes.size < 24 || !bytes.copyOfRange(12, 16).contentEquals("IHDR".toByteArray())) throw EOFException()
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
        return buffer.getInt(16) to buffer.getInt(20)
    }

    @Suppress("CognitiveComplexMethod")
    private fun jpegDimensions(path: Path): Pair<Int, Int> {
        Files.newInputStream(path).use { raw ->
            val input = BufferedInputStream(raw)
            if (input.read() != 0xff || input.read() != 0xd8) throw EOFException()
            while (true) {
                var markerStart = input.read()
                while (markerStart == 0xff) markerStart = input.read()
                if (markerStart < 0) throw EOFException()
                if (markerStart in jpegStartOfFrameMarkers) {
                    readUnsignedShort(input)
                    input.read()
                    val height = readUnsignedShort(input)
                    val width = readUnsignedShort(input)
                    return width to height
                }
                val segmentLength = readUnsignedShort(input)
                if (segmentLength < 2) throw EOFException()
                input.skipNBytes((segmentLength - 2).toLong())
            }
        }
    }

    private fun webpDimensions(path: Path): Pair<Int, Int> {
        val bytes = Files.newInputStream(path).use { it.readNBytes(30) }
        if (bytes.size < 30) throw EOFException()
        val chunk = bytes.copyOfRange(12, 16).toString(Charsets.US_ASCII)
        return when (chunk) {
            "VP8X" -> (1 + littleEndian24(bytes, 24)) to (1 + littleEndian24(bytes, 27))
            "VP8L" -> {
                if (bytes[20] != 0x2f.toByte()) throw EOFException()
                val bits = ByteBuffer.wrap(bytes, 21, 4).order(ByteOrder.LITTLE_ENDIAN).int
                (1 + (bits and 0x3fff)) to (1 + ((bits ushr 14) and 0x3fff))
            }
            else -> throw EOFException()
        }
    }

    private fun readUnsignedShort(input: BufferedInputStream): Int {
        val first = input.read()
        val second = input.read()
        if (first < 0 || second < 0) throw EOFException()
        return (first shl 8) or second
    }

    private fun littleEndian24(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xff) or
            ((bytes[offset + 1].toInt() and 0xff) shl 8) or
            ((bytes[offset + 2].toInt() and 0xff) shl 16)

    private fun safeFileName(original: String?, index: Int): String =
        original?.let { Path.of(it).fileName.toString().trim().take(512) }?.takeIf(String::isNotEmpty) ?: "source-${index + 1}"

    private fun rejectionFor(failure: Throwable): WorksheetUploadRejectionCode = when (failure) {
        is EmptyUpload -> WorksheetUploadRejectionCode.EMPTY
        is OversizedUpload -> WorksheetUploadRejectionCode.FILE_TOO_LARGE
        else -> throw failure
    }

    private data class StagedBytes(val byteSize: Long, val checksumSha256: String)
    private data class DetectedSource(val kind: WorksheetSourceKind, val mimeType: String, val acceptedMimeTypes: Set<String>)
    private class EmptyUpload : RuntimeException()
    private class OversizedUpload : RuntimeException()

    private companion object {
        val pngSignature = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
        val imageMimeTypes = setOf("image/jpeg", "image/jpg", "image/png", "image/webp")
        val imageExtensions = setOf(".jpg", ".jpeg", ".png", ".webp")
        val jpegStartOfFrameMarkers = setOf(0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf)
    }
}
