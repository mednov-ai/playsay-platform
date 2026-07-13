package com.playsay.media.service

import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception

data class MediaObjectMetadata(
    val contentType: String,
    val contentLength: Long,
    val metadata: Map<String, String>,
)

data class MediaObjectContent(
    val inputStream: InputStream,
    val contentType: String,
    val contentLength: Long,
    val contentRange: String?,
    val acceptRanges: String,
)

interface MediaObjectStorage {
    fun putObject(key: String, bytes: ByteArray, contentType: String, metadata: Map<String, String> = emptyMap())
    fun putFile(key: String, file: Path, contentType: String, metadata: Map<String, String> = emptyMap())
    fun headObject(key: String): MediaObjectMetadata?
    fun getObject(key: String, rangeHeader: String?): MediaObjectContent?
    fun deleteObject(key: String): Boolean
}

class MediaObjectStorageException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

class S3MediaObjectStorage(
    private val s3Client: S3Client,
    private val bucket: String,
    private val createBucket: Boolean,
) : MediaObjectStorage {
    private val bucketReady = AtomicBoolean(false)

    override fun putObject(key: String, bytes: ByteArray, contentType: String, metadata: Map<String, String>) {
        ensureBucket()
        put(key, contentType, bytes.size.toLong(), metadata, RequestBody.fromBytes(bytes))
    }

    override fun putFile(key: String, file: Path, contentType: String, metadata: Map<String, String>) {
        ensureBucket()
        put(key, contentType, Files.size(file), metadata, RequestBody.fromFile(file))
    }

    override fun headObject(key: String): MediaObjectMetadata? {
        ensureBucket()
        return try {
            val response = s3Client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build())
            MediaObjectMetadata(
                contentType = response.contentType() ?: "application/octet-stream",
                contentLength = response.contentLength(),
                metadata = response.metadata(),
            )
        } catch (exception: S3Exception) {
            if (exception.statusCode() == 404) {
                null
            } else {
                throw MediaObjectStorageException("Failed to inspect media object.", exception)
            }
        }
    }

    override fun getObject(key: String, rangeHeader: String?): MediaObjectContent? {
        ensureBucket()
        return try {
            val request = GetObjectRequest.builder().bucket(bucket).key(key).apply {
                rangeHeader?.trim()?.takeIf { value -> value.isNotEmpty() }?.let(::range)
            }.build()
            val input = s3Client.getObject(request)
            val response = input.response()
            MediaObjectContent(
                inputStream = input,
                contentType = response.contentType() ?: "application/octet-stream",
                contentLength = response.contentLength(),
                contentRange = response.contentRange(),
                acceptRanges = response.acceptRanges() ?: "bytes",
            )
        } catch (exception: S3Exception) {
            if (exception.statusCode() == 404 || exception.statusCode() == 416) {
                null
            } else {
                throw MediaObjectStorageException("Failed to read media object.", exception)
            }
        }
    }

    override fun deleteObject(key: String): Boolean {
        ensureBucket()
        return try {
            s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build())
            true
        } catch (exception: S3Exception) {
            throw MediaObjectStorageException("Failed to delete media object.", exception)
        }
    }

    private fun put(
        key: String,
        contentType: String,
        contentLength: Long,
        metadata: Map<String, String>,
        requestBody: RequestBody,
    ) {
        try {
            s3Client.putObject(
                PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType)
                    .contentLength(contentLength)
                    .metadata(metadata)
                    .build(),
                requestBody,
            )
        } catch (exception: S3Exception) {
            throw MediaObjectStorageException("Failed to store media object.", exception)
        }
    }

    private fun ensureBucket() {
        if (bucketReady.get()) {
            return
        }
        try {
            s3Client.headBucket(HeadBucketRequest.builder().bucket(bucket).build())
            bucketReady.set(true)
        } catch (exception: NoSuchBucketException) {
            createBucketOrFail(exception)
        } catch (exception: S3Exception) {
            if (exception.statusCode() == 404) {
                createBucketOrFail(exception)
            } else {
                throw MediaObjectStorageException("Failed to check media object bucket.", exception)
            }
        }
    }

    private fun createBucketOrFail(cause: Throwable) {
        if (!createBucket) {
            throw MediaObjectStorageException("Media object bucket does not exist.", cause)
        }
        try {
            s3Client.createBucket(CreateBucketRequest.builder().bucket(bucket).build())
            bucketReady.set(true)
        } catch (exception: S3Exception) {
            if (exception.statusCode() == 409) {
                bucketReady.set(true)
                return
            }
            throw MediaObjectStorageException("Failed to create media object bucket.", exception)
        }
    }
}

class InMemoryMediaObjectStorage : MediaObjectStorage {
    data class StoredObject(
        val bytes: ByteArray,
        val contentType: String,
        val metadata: Map<String, String>,
    )

    private val objects = ConcurrentHashMap<String, StoredObject>()

    override fun putObject(key: String, bytes: ByteArray, contentType: String, metadata: Map<String, String>) {
        objects[key] = StoredObject(bytes.copyOf(), contentType, metadata.toMap())
    }

    override fun putFile(key: String, file: Path, contentType: String, metadata: Map<String, String>) {
        putObject(key, Files.readAllBytes(file), contentType, metadata)
    }

    override fun headObject(key: String): MediaObjectMetadata? =
        objects[key]?.let { stored ->
            MediaObjectMetadata(stored.contentType, stored.bytes.size.toLong(), stored.metadata)
        }

    override fun getObject(key: String, rangeHeader: String?): MediaObjectContent? {
        val stored = objects[key] ?: return null
        val range = parseRange(rangeHeader, stored.bytes.size)
        val bytes = if (range == null) stored.bytes else stored.bytes.copyOfRange(range.first, range.last + 1)
        return MediaObjectContent(
            inputStream = ByteArrayInputStream(bytes),
            contentType = stored.contentType,
            contentLength = bytes.size.toLong(),
            contentRange = range?.let { value -> "bytes ${value.first}-${value.last}/${stored.bytes.size}" },
            acceptRanges = "bytes",
        )
    }

    override fun deleteObject(key: String): Boolean {
        objects.remove(key)
        return true
    }

    private fun parseRange(value: String?, length: Int): IntRange? {
        val match = value?.trim()?.let { singleRange.matchEntire(it) } ?: return null
        val start = match.groupValues[1].toIntOrNull() ?: return null
        val end = match.groupValues[2].toIntOrNull()?.coerceAtMost(length - 1) ?: (length - 1)
        if (start !in 0 until length || end < start) {
            return null
        }
        return start..end
    }

    companion object {
        private val singleRange = Regex("^bytes=(\\d+)-(\\d*)$")
    }
}
