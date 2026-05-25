package com.playsay.gateway

import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.ResponseBytes
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception

data class MaterialObjectContent(
    val key: String,
    val bytes: ByteArray,
    val contentType: String,
    val contentLength: Long,
)

interface MaterialObjectStorage {
    fun putObject(key: String, bytes: ByteArray, contentType: String)
    fun getObject(key: String): MaterialObjectContent
    fun deleteObject(key: String)
}

class MaterialObjectStorageException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
class MaterialObjectNotFoundException(key: String, cause: Throwable? = null) : RuntimeException("Object not found: $key", cause)

@Configuration
class MaterialObjectStorageConfig {
    @Bean
    @ConditionalOnProperty(prefix = "playsay.storage", name = ["provider"], havingValue = "s3")
    fun s3MaterialObjectStorage(
        @Value("\${playsay.storage.s3.endpoint:}") endpoint: String,
        @Value("\${playsay.storage.s3.region:us-east-1}") region: String,
        @Value("\${playsay.storage.s3.bucket:playsay-material-assets}") bucket: String,
        @Value("\${playsay.storage.s3.access-key:}") accessKey: String,
        @Value("\${playsay.storage.s3.secret-key:}") secretKey: String,
        @Value("\${playsay.storage.s3.path-style-access:true}") pathStyleAccess: Boolean,
        @Value("\${playsay.storage.s3.create-bucket:false}") createBucket: Boolean,
    ): MaterialObjectStorage {
        if (accessKey.isBlank() || secretKey.isBlank()) {
            throw MaterialObjectStorageException("S3 object storage credentials are not configured.")
        }
        val s3Region = Region.of(region.ifBlank { "us-east-1" })
        val clientBuilder = S3Client.builder()
            .region(s3Region)
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(pathStyleAccess).build())
        endpoint.trim().takeIf { value -> value.isNotEmpty() }?.let { value ->
            clientBuilder.endpointOverride(URI.create(value))
        }
        return S3MaterialObjectStorage(clientBuilder.build(), bucket, createBucket)
    }

    @Bean
    @ConditionalOnProperty(prefix = "playsay.storage", name = ["provider"], havingValue = "memory", matchIfMissing = true)
    fun inMemoryMaterialObjectStorage(): MaterialObjectStorage = InMemoryMaterialObjectStorage()
}

class S3MaterialObjectStorage(
    private val s3Client: S3Client,
    private val bucket: String,
    private val createBucket: Boolean,
) : MaterialObjectStorage {
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
            throw MaterialObjectStorageException("Failed to store material object.", exception)
        }
    }

    override fun getObject(key: String): MaterialObjectContent {
        ensureBucket()
        val response: ResponseBytes<GetObjectResponse> = try {
            s3Client.getObjectAsBytes(
                GetObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .build(),
            )
        } catch (exception: NoSuchKeyException) {
            throw MaterialObjectNotFoundException(key, exception)
        } catch (exception: S3Exception) {
            if (exception.statusCode() == 404) {
                throw MaterialObjectNotFoundException(key, exception)
            }
            throw MaterialObjectStorageException("Failed to read material object.", exception)
        }
        val metadata = response.response()
        return MaterialObjectContent(
            key = key,
            bytes = response.asByteArray(),
            contentType = metadata.contentType() ?: "application/octet-stream",
            contentLength = metadata.contentLength(),
        )
    }

    override fun deleteObject(key: String) {
        ensureBucket()
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build())
        } catch (exception: S3Exception) {
            throw MaterialObjectStorageException("Failed to delete material object.", exception)
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
                throw MaterialObjectStorageException("Failed to check material object bucket.", exception)
            }
        }
    }

    private fun createBucketOrFail(cause: Throwable) {
        if (!createBucket) {
            throw MaterialObjectStorageException("Material object bucket does not exist.", cause)
        }
        try {
            s3Client.createBucket(CreateBucketRequest.builder().bucket(bucket).build())
            bucketReady.set(true)
        } catch (exception: S3Exception) {
            if (exception.statusCode() == 409) {
                bucketReady.set(true)
                return
            }
            throw MaterialObjectStorageException("Failed to create material object bucket.", exception)
        }
    }
}

class InMemoryMaterialObjectStorage : MaterialObjectStorage {
    private data class StoredObject(
        val bytes: ByteArray,
        val contentType: String,
    )

    private val objects = ConcurrentHashMap<String, StoredObject>()

    override fun putObject(key: String, bytes: ByteArray, contentType: String) {
        objects[key] = StoredObject(bytes.copyOf(), contentType)
    }

    override fun getObject(key: String): MaterialObjectContent {
        val stored = objects[key] ?: throw MaterialObjectNotFoundException(key)
        return MaterialObjectContent(
            key = key,
            bytes = stored.bytes.copyOf(),
            contentType = stored.contentType,
            contentLength = stored.bytes.size.toLong(),
        )
    }

    override fun deleteObject(key: String) {
        objects.remove(key)
    }
}
