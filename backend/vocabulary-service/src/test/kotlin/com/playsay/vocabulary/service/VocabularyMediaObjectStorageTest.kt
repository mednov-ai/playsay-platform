package com.playsay.vocabulary.service

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception

class VocabularyMediaObjectStorageTest {
    @Test
    fun `dev storage creates a missing bucket before writing`() {
        val client = mock(S3Client::class.java)
        `when`(client.headBucket(any(HeadBucketRequest::class.java)))
            .thenThrow(S3Exception.builder().statusCode(404).message("missing").build())
        val storage = S3VocabularyMediaObjectStorage(client, "playsay-vocabulary-media", createBucket = true)

        storage.put("vocabulary-media/test.png", byteArrayOf(1), "image/png")

        verify(client).createBucket(any(CreateBucketRequest::class.java))
        verify(client).putObject(any(PutObjectRequest::class.java), any(RequestBody::class.java))
    }

    @Test
    fun `persistent storage fails closed when automatic bucket creation is disabled`() {
        val client = mock(S3Client::class.java)
        `when`(client.headBucket(any(HeadBucketRequest::class.java)))
            .thenThrow(S3Exception.builder().statusCode(404).message("missing").build())
        val storage = S3VocabularyMediaObjectStorage(client, "playsay-vocabulary-media", createBucket = false)

        val error = assertThrows(VocabularyMediaStorageException::class.java) {
            storage.put("vocabulary-media/test.png", byteArrayOf(1), "image/png")
        }

        assertEquals("STORAGE_BUCKET_MISSING", error.code)
        verify(client, never()).createBucket(any(CreateBucketRequest::class.java))
    }
}
