package com.playsay.gateway.service

import java.util.concurrent.ExecutorService
import java.util.concurrent.atomic.AtomicBoolean
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class MaterialGameAdaptationWorker(
    private val service: MaterialGameAdaptationService,
    @param:Qualifier("materialHtmlGameEnrichmentExecutor") private val executor: ExecutorService,
    @param:Value("\${playsay.game-adapter-service.enabled:true}") private val enabled: Boolean,
) {
    private val busy = AtomicBoolean(false)

    @Scheduled(fixedDelayString = "\${playsay.game-adapter-service.poll-delay-ms:3000}")
    fun dispatch() {
        if (!enabled || !busy.compareAndSet(false, true)) return
        val jobId = runCatching { service.claimNext() }.getOrElse {
            busy.set(false)
            logger.warn("Could not claim game adaptation job", it)
            return
        }
        if (jobId == null) {
            busy.set(false)
            return
        }
        runCatching {
            executor.execute {
                try {
                    service.process(jobId)
                } finally {
                    busy.set(false)
                }
            }
        }.onFailure {
            busy.set(false)
            logger.warn("Could not submit game adaptation job id={}", jobId, it)
        }
    }

    private companion object {
        val logger = LoggerFactory.getLogger(MaterialGameAdaptationWorker::class.java)
    }
}
