package com.playsay.vocabulary.service

import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception

data class VocabularyMediaObject(val bytes: ByteArray, val contentType: String)

interface VocabularyMediaObjectStorage {
    fun put(key: String, bytes: ByteArray, contentType: String)
    fun get(key: String): VocabularyMediaObject
    fun exists(key: String): Boolean
    fun delete(key: String)
}

class InMemoryVocabularyMediaObjectStorage : VocabularyMediaObjectStorage {
    private val objects = ConcurrentHashMap<String, VocabularyMediaObject>()
    override fun put(key: String, bytes: ByteArray, contentType: String) { objects[key] = VocabularyMediaObject(bytes.copyOf(), contentType) }
    override fun get(key: String): VocabularyMediaObject = objects[key] ?: throw VocabularyMediaStorageException("OBJECT_MISSING")
    override fun exists(key: String): Boolean = objects.containsKey(key)
    override fun delete(key: String) { objects.remove(key) }
}

class S3VocabularyMediaObjectStorage(
    private val client: S3Client,
    private val bucket: String,
    private val createBucket: Boolean,
) : VocabularyMediaObjectStorage {
    private val bucketReady = AtomicBoolean(false)

    override fun put(key: String, bytes: ByteArray, contentType: String) {
        ensureBucket()
        runCatching { client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).build(), RequestBody.fromBytes(bytes)) }
            .getOrElse { throw VocabularyMediaStorageException("STORAGE_WRITE_FAILED", it) }
    }
    override fun get(key: String): VocabularyMediaObject = runCatching {
        ensureBucket()
        val response = client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build())
        VocabularyMediaObject(response.asByteArray(), response.response().contentType() ?: "application/octet-stream")
    }.getOrElse { throw VocabularyMediaStorageException("STORAGE_READ_FAILED", it) }
    override fun exists(key: String): Boolean = runCatching {
        ensureBucket()
        client.headObject { it.bucket(bucket).key(key) }
        true
    }.getOrDefault(false)
    override fun delete(key: String) {
        ensureBucket()
        runCatching { client.deleteObject { it.bucket(bucket).key(key) } }
            .getOrElse { throw VocabularyMediaStorageException("STORAGE_DELETE_FAILED", it) }
    }

    private fun ensureBucket() {
        if (bucketReady.get()) return
        try {
            client.headBucket(HeadBucketRequest.builder().bucket(bucket).build())
            bucketReady.set(true)
        } catch (failure: NoSuchBucketException) {
            createBucketOrFail(failure)
        } catch (failure: S3Exception) {
            if (failure.statusCode() == 404) createBucketOrFail(failure)
            else throw VocabularyMediaStorageException("STORAGE_BUCKET_CHECK_FAILED", failure)
        }
    }

    private fun createBucketOrFail(cause: Throwable) {
        if (!createBucket) throw VocabularyMediaStorageException("STORAGE_BUCKET_MISSING", cause)
        try {
            client.createBucket(CreateBucketRequest.builder().bucket(bucket).build())
            bucketReady.set(true)
        } catch (failure: S3Exception) {
            if (failure.statusCode() == 409) {
                bucketReady.set(true)
                return
            }
            throw VocabularyMediaStorageException("STORAGE_BUCKET_CREATE_FAILED", failure)
        }
    }
}

class VocabularyMediaStorageException(val code: String, cause: Throwable? = null) : RuntimeException(code, cause)

@Configuration(proxyBeanMethods = false)
class VocabularyMediaStorageConfig {
    @Bean
    @ConditionalOnProperty(prefix = "playsay.vocabulary.media.storage", name = ["provider"], havingValue = "memory", matchIfMissing = true)
    fun memoryVocabularyMediaStorage(): VocabularyMediaObjectStorage = InMemoryVocabularyMediaObjectStorage()

    @Bean
    @ConditionalOnProperty(prefix = "playsay.vocabulary.media.storage", name = ["provider"], havingValue = "s3")
    fun s3VocabularyMediaStorage(
        @Value("\${playsay.vocabulary.media.storage.endpoint:}") endpoint: String,
        @Value("\${playsay.vocabulary.media.storage.region:us-east-1}") region: String,
        @Value("\${playsay.vocabulary.media.storage.bucket:playsay-vocabulary-media}") bucket: String,
        @Value("\${playsay.vocabulary.media.storage.access-key:}") accessKey: String,
        @Value("\${playsay.vocabulary.media.storage.secret-key:}") secretKey: String,
        @Value("\${playsay.vocabulary.media.storage.create-bucket:false}") createBucket: Boolean,
    ): VocabularyMediaObjectStorage {
        require(accessKey.isNotBlank() && secretKey.isNotBlank()) { "Vocabulary media S3 credentials are not configured" }
        val builder = S3Client.builder()
            .region(Region.of(region))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
        endpoint.trim().takeIf(String::isNotEmpty)?.let { builder.endpointOverride(URI.create(it)) }
        return S3VocabularyMediaObjectStorage(builder.build(), bucket, createBucket)
    }
}
