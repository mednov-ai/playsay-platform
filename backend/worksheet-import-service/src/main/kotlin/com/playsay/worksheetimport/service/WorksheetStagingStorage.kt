package com.playsay.worksheetimport.service

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
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception

data class WorksheetStagingContent(
    val bytes: ByteArray,
    val contentType: String,
)

interface WorksheetStagingStorage {
    fun put(key: String, source: Path, contentType: String)
    fun get(key: String): WorksheetStagingContent
    fun delete(key: String)
}

class WorksheetStagingException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
class WorksheetStagingNotFoundException : RuntimeException("Worksheet staging object was not found.")

class InMemoryWorksheetStagingStorage : WorksheetStagingStorage {
    private data class Stored(val bytes: ByteArray, val contentType: String)
    private val objects = ConcurrentHashMap<String, Stored>()

    override fun put(key: String, source: Path, contentType: String) {
        objects[key] = Stored(Files.readAllBytes(source), contentType)
    }

    override fun get(key: String): WorksheetStagingContent {
        val stored = objects[key] ?: throw WorksheetStagingNotFoundException()
        return WorksheetStagingContent(stored.bytes.copyOf(), stored.contentType)
    }

    override fun delete(key: String) {
        objects.remove(key)
    }

    internal fun keys(): Set<String> = objects.keys.toSet()
}

class S3WorksheetStagingStorage(
    private val client: S3Client,
    private val bucket: String,
    private val createBucket: Boolean,
) : WorksheetStagingStorage {
    private val bucketReady = AtomicBoolean(false)

    override fun put(key: String, source: Path, contentType: String) {
        ensureBucket()
        try {
            client.putObject(
                PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType)
                    .contentLength(Files.size(source))
                    .build(),
                RequestBody.fromFile(source),
            )
        } catch (exception: S3Exception) {
            throw WorksheetStagingException("Failed to store worksheet staging object.", exception)
        }
    }

    override fun get(key: String): WorksheetStagingContent {
        ensureBucket()
        try {
            client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build()).use { response ->
                return WorksheetStagingContent(response.readAllBytes(), response.response().contentType() ?: "application/octet-stream")
            }
        } catch (exception: NoSuchKeyException) {
            throw WorksheetStagingNotFoundException()
        } catch (exception: S3Exception) {
            if (exception.statusCode() == 404) throw WorksheetStagingNotFoundException()
            throw WorksheetStagingException("Failed to read worksheet staging object.", exception)
        }
    }

    override fun delete(key: String) {
        ensureBucket()
        try {
            client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build())
        } catch (exception: S3Exception) {
            throw WorksheetStagingException("Failed to delete worksheet staging object.", exception)
        }
    }

    private fun ensureBucket() {
        if (bucketReady.get()) return
        try {
            client.headBucket(HeadBucketRequest.builder().bucket(bucket).build())
            bucketReady.set(true)
        } catch (exception: NoSuchBucketException) {
            createBucketOrFail(exception)
        } catch (exception: S3Exception) {
            if (exception.statusCode() == 404) createBucketOrFail(exception)
            else throw WorksheetStagingException("Failed to inspect worksheet staging bucket.", exception)
        }
    }

    private fun createBucketOrFail(cause: Throwable) {
        if (!createBucket) throw WorksheetStagingException("Worksheet staging bucket does not exist.", cause)
        try {
            client.createBucket(CreateBucketRequest.builder().bucket(bucket).build())
            bucketReady.set(true)
        } catch (exception: S3Exception) {
            if (exception.statusCode() == 409) bucketReady.set(true)
            else throw WorksheetStagingException("Failed to create worksheet staging bucket.", exception)
        }
    }
}
