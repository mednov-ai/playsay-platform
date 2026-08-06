package com.playsay.gateway.service

import com.playsay.gateway.entity.MaterialGameAdaptationEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.MaterialGameAdaptationRepo
import java.time.Instant
import java.util.Optional
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`

class MaterialGameAdaptationServiceFailureTest {
    private val repo = mock(MaterialGameAdaptationRepo::class.java)
    private val service = MaterialGameAdaptationService(
        repo = repo,
        lessonMaterialRepo = mock(LessonMaterialRepo::class.java),
        materialAssetService = mock(MaterialAssetService::class.java),
        materialAssetUploadService = mock(MaterialAssetUploadService::class.java),
        adapterClient = mock(MaterialGameAdapterClient::class.java),
    )

    @Test
    fun `terminal contract failure is not rescheduled`() {
        val job = job(attempts = 1)
        `when`(repo.findById(job.id)).thenReturn(Optional.of(job))
        `when`(repo.save(job)).thenReturn(job)

        service.fail(job.id, "GAME_ADAPTER_CONTRACT_INVALID", retryable = false)

        assertEquals(MaterialGameAdaptationStatuses.FAILED, job.status)
        assertEquals("GAME_ADAPTER_CONTRACT_INVALID", job.lastErrorCode)
        assertNull(job.nextAttemptAt)
        assertNull(job.leaseUntil)
    }

    @Test
    fun `transient infrastructure failure keeps bounded retry`() {
        val job = job(attempts = 1)
        `when`(repo.findById(job.id)).thenReturn(Optional.of(job))
        `when`(repo.save(job)).thenReturn(job)

        service.fail(job.id, "GAME_ADAPTER_UNAVAILABLE", retryable = true)

        assertEquals(MaterialGameAdaptationStatuses.RETRY, job.status)
        assertEquals("GAME_ADAPTER_UNAVAILABLE", job.lastErrorCode)
        assertNotNull(job.nextAttemptAt)
        assertNull(job.leaseUntil)
    }

    @Test
    fun `third transient failure exhausts retries`() {
        val job = job(attempts = 3)
        `when`(repo.findById(job.id)).thenReturn(Optional.of(job))
        `when`(repo.save(job)).thenReturn(job)

        service.fail(job.id, "GAME_ADAPTER_UNAVAILABLE", retryable = true)

        assertEquals(MaterialGameAdaptationStatuses.FAILED, job.status)
        assertNull(job.nextAttemptAt)
    }

    @Test
    fun `terminal validator failure keeps safe mechanics diagnostics`() {
        val job = job(attempts = 1)
        `when`(repo.findById(job.id)).thenReturn(Optional.of(job))
        `when`(repo.save(job)).thenReturn(job)

        service.fail(
            job.id,
            "GAME_ADAPTER_MECHANICS_CHANGED",
            retryable = false,
            validationReport = """{"failureCode":"RANGE_VALUE_INVALID","mechanicsEquivalent":false,"validatorVersion":"mechanics-v3"}""",
        )

        assertEquals(MaterialGameMechanicsValidation.FAILED, job.mechanicsValidation)
        assertEquals("mechanics-v3", job.validatorVersion)
        assertTrue(job.validationReport.orEmpty().contains("RANGE_VALUE_INVALID"))
    }

    @Test
    fun `apply rejects a result created by an old mechanics validator`() {
        val job = job(attempts = 1).apply {
            status = MaterialGameAdaptationStatuses.READY_FOR_REVIEW
            adaptedAssetId = UUID.randomUUID()
            mechanicsValidation = MaterialGameMechanicsValidation.REVALIDATION_REQUIRED
            validatorVersion = null
        }
        `when`(repo.findById(job.id)).thenReturn(Optional.of(job))

        val failure = assertFailsWith<ProjectResponseException> {
            service.apply(job.materialId, job.sourceAssetId, job.id)
        }

        assertEquals("GAME_ADAPTER_NOT_READY", failure.errorCode)
    }

    private fun job(attempts: Int) = MaterialGameAdaptationEntity(
        id = UUID.randomUUID(),
        materialId = UUID.randomUUID(),
        sourceAssetId = UUID.randomUUID(),
        blockId = "game",
        status = MaterialGameAdaptationStatuses.ANALYZING,
        compatibility = "LEGACY_MIRROR",
        attempts = attempts,
        leaseUntil = Instant.now().plusSeconds(60),
        createdAt = Instant.now(),
        updatedAt = Instant.now(),
    )
}
