package com.playsay.media

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
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception

interface MediaObjectStorage {
    fun putObject(key: String, bytes: ByteArray, contentType: String)
}

class MediaObjectStorageException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

class S3MediaObjectStorage(
    private val s3Client: S3Client,
    private val bucket: String,
    private val createBucket: Boolean,
) : MediaObjectStorage {
    private val bucketReady = AtomicBoolean(false)

    override fun putObject(key: String, bytes: ByteArray, contentType: String) {
        ensureBucket()
        try {
            s3Client.putObject(
                PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType)
                    .contentLength(bytes.size.toLong())
                    .build(),
                RequestBody.fromBytes(bytes),
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
    )

    private val objects = ConcurrentHashMap<String, StoredObject>()

    override fun putObject(key: String, bytes: ByteArray, contentType: String) {
        objects[key] = StoredObject(bytes.copyOf(), contentType)
    }
}

@Configuration
class MediaObjectStorageConfig {
    @Bean
    @ConditionalOnProperty(prefix = "playsay.storage", name = ["provider"], havingValue = "s3")
    fun s3MediaObjectStorage(
        @Value("\${playsay.storage.s3.endpoint:}") endpoint: String,
        @Value("\${playsay.storage.s3.region:us-east-1}") region: String,
        @Value("\${playsay.storage.s3.bucket:playsay-material-assets}") bucket: String,
        @Value("\${playsay.storage.s3.access-key:}") accessKey: String,
        @Value("\${playsay.storage.s3.secret-key:}") secretKey: String,
        @Value("\${playsay.storage.s3.path-style-access:true}") pathStyleAccess: Boolean,
        @Value("\${playsay.storage.s3.create-bucket:false}") createBucket: Boolean,
    ): MediaObjectStorage {
        val builder = S3Client.builder()
            .region(Region.of(region))
            .serviceConfiguration(
                S3Configuration.builder()
                    .pathStyleAccessEnabled(pathStyleAccess)
                    .build(),
            )
        endpoint.trim().takeIf { value -> value.isNotEmpty() }?.let { value -> builder.endpointOverride(URI.create(value)) }
        if (accessKey.isNotBlank() || secretKey.isNotBlank()) {
            builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
        }
        return S3MediaObjectStorage(builder.build(), bucket, createBucket)
    }

    @Bean
    @ConditionalOnProperty(prefix = "playsay.storage", name = ["provider"], havingValue = "memory", matchIfMissing = true)
    fun inMemoryMediaObjectStorage(): MediaObjectStorage = InMemoryMediaObjectStorage()
}
