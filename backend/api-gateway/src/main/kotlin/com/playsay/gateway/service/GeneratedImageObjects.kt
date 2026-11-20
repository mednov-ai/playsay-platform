package com.playsay.gateway.service

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.GeneratedImageCleanupRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Duration
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service

@Service
class GeneratedImageObjects(
    private val storage: MaterialObjectStorage,
    private val cleanup: GeneratedImageCleanupRepo,
    private val clock: Clock,
) {
    internal fun prepare(materialId: UUID, image: GeneratedMaterialImage): PreparedMaterialImage {
        val key = "material-assets/$materialId/generated/${UUID.randomUUID()}.${image.mimeType.materialImageExtension()}"
        cleanup.register(key, clock.instant().plus(Duration.ofDays(1)))
        try {
            storage.putObject(key, image.bytes, image.mimeType)
        } catch (error: MaterialObjectStorageException) {
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.MATERIAL_ASSET_STORAGE_FAILED)
        }
        return PreparedMaterialImage(key, image.bytes.size, image.copy(bytes = byteArrayOf()))
    }

    internal fun publish(materialId: UUID, key: String, replaced: String?) {
        check(cleanup.releaseForPublication(key)) { "Prepared image expired before publication" }
        if (replaced?.startsWith("material-assets/$materialId/") == true) {
            cleanup.retire(replaced, clock.instant().plus(Duration.ofHours(1)))
        }
    }

    @Scheduled(fixedDelayString = "PT10M", initialDelayString = "PT10M")
    fun collect() {
        for (key in cleanup.due(clock.instant())) {
            if (!cleanup.claim(key, clock.instant())) continue
            try {
                storage.deleteObject(key)
                cleanup.complete(key)
            } catch (error: MaterialObjectStorageException) {
                logger.warn("Generated image cleanup will retry")
            }
        }
    }

    private companion object {
        val logger = LoggerFactory.getLogger(GeneratedImageObjects::class.java)
    }
}
