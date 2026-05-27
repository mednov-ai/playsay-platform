package com.playsay.gateway.config

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
import com.playsay.gateway.service.*

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
