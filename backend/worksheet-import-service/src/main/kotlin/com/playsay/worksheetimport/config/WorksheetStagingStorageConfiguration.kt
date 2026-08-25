package com.playsay.worksheetimport.config

import com.playsay.worksheetimport.service.InMemoryWorksheetStagingStorage
import com.playsay.worksheetimport.service.S3WorksheetStagingStorage
import com.playsay.worksheetimport.service.WorksheetStagingException
import com.playsay.worksheetimport.service.WorksheetStagingStorage
import java.net.URI
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.S3Client

@Configuration
class WorksheetStagingStorageConfiguration {
    @Bean
    @ConditionalOnProperty(prefix = "playsay.worksheet-import.storage", name = ["provider"], havingValue = "memory", matchIfMissing = true)
    fun memoryWorksheetStagingStorage(): WorksheetStagingStorage = InMemoryWorksheetStagingStorage()

    @Bean
    @ConditionalOnProperty(prefix = "playsay.worksheet-import.storage", name = ["provider"], havingValue = "s3")
    fun s3WorksheetStagingStorage(properties: WorksheetImportProperties): WorksheetStagingStorage {
        val storage = properties.storage
        if (storage.accessKey.isBlank() || storage.secretKey.isBlank()) {
            throw WorksheetStagingException("Worksheet staging credentials are not configured.")
        }
        val builder = S3Client.builder()
            .region(Region.of(storage.region))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(storage.accessKey, storage.secretKey)))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(storage.pathStyleAccess).build())
        storage.endpoint.trim().takeIf(String::isNotEmpty)?.let { builder.endpointOverride(URI.create(it)) }
        return S3WorksheetStagingStorage(builder.build(), storage.bucket, storage.createBucket)
    }
}
