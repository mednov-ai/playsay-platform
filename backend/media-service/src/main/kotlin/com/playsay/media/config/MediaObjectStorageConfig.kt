package com.playsay.media.config

import com.playsay.media.service.InMemoryMediaObjectStorage
import com.playsay.media.service.MediaObjectStorage
import com.playsay.media.service.S3MediaObjectStorage
import java.net.URI
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.S3Configuration

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
