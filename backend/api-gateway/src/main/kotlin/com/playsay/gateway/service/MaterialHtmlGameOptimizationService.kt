package com.playsay.gateway.service

import com.playsay.gateway.client.HTML_GAME_IMAGE_OPTIMIZATION_POLICY
import com.playsay.gateway.client.HtmlGameOptimizerClientException
import com.playsay.gateway.client.MaterialHtmlGameOptimizerClient
import com.playsay.gateway.dto.HtmlGameOptimizationMetadata
import com.playsay.gateway.dto.HtmlGameOptimizationResult
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import java.nio.charset.StandardCharsets
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

data class OptimizedHtmlGameUpload(
    val upload: ValidatedMaterialAssetFile,
    val metadata: HtmlGameOptimizationMetadata,
)

@Service
class MaterialHtmlGameOptimizationService(
    private val optimizerClient: MaterialHtmlGameOptimizerClient,
    private val uploadService: MaterialAssetUploadService,
    private val meterRegistry: MeterRegistry,
) {
    fun optimizeIfRequired(upload: ValidatedMaterialAssetFile): OptimizedHtmlGameUpload {
        val html = requireNotNull(upload.text)
        val inputBytes = upload.bytes.size
        if (!requiresOptimization(html)) {
            meterRegistry.counter("playsay.html_game.image_optimization", "status", "not_needed").increment()
            return OptimizedHtmlGameUpload(
                upload,
                HtmlGameOptimizationMetadata("NOT_NEEDED", HTML_GAME_IMAGE_OPTIMIZATION_POLICY, inputBytes, inputBytes, 0, 0, 0),
            )
        }

        val sample = Timer.start(meterRegistry)
        val response = try {
            optimizerClient.optimize(html)
        } catch (exception: HtmlGameOptimizerClientException) {
            val failure = if (exception.invalidImage) "invalid_image" else "unavailable"
            sample.stop(timer("failed"))
            meterRegistry.counter("playsay.html_game.image_optimization_failures", "reason", failure).increment()
            logger.warn("HTML game image optimization failed reason={}", failure)
            throw ProjectResponseException.localized(
                if (exception.invalidImage) HttpStatus.UNPROCESSABLE_ENTITY else HttpStatus.SERVICE_UNAVAILABLE,
                if (exception.invalidImage) {
                    MetaData.ErrorCodes.MATERIAL_HTML_GAME_IMAGE_INVALID
                } else {
                    MetaData.ErrorCodes.MATERIAL_HTML_GAME_OPTIMIZATION_UNAVAILABLE
                },
            )
        } catch (exception: RuntimeException) {
            sample.stop(timer("failed"))
            meterRegistry.counter("playsay.html_game.image_optimization_failures", "reason", "unavailable").increment()
            logger.warn("HTML game image optimization failed reason=unavailable")
            throw ProjectResponseException.localized(
                HttpStatus.SERVICE_UNAVAILABLE,
                MetaData.ErrorCodes.MATERIAL_HTML_GAME_OPTIMIZATION_UNAVAILABLE,
            )
        }
        try {
            validateResponse(response, inputBytes)
        } catch (exception: ProjectResponseException) {
            sample.stop(timer("failed"))
            throw exception
        }
        val optimizedBytes = response.html.toByteArray(StandardCharsets.UTF_8)
        val optimizedUpload = try {
            uploadService.revalidateHtmlGameBytes(upload, optimizedBytes)
        } catch (exception: ProjectResponseException) {
            sample.stop(timer("failed"))
            meterRegistry.counter("playsay.html_game.image_optimization_failures", "reason", "returned_html_invalid").increment()
            logger.warn("HTML game image optimization failed reason=returned_html_invalid")
            throw exception
        }
        sample.stop(timer(response.status.lowercase()))
        meterRegistry.counter("playsay.html_game.image_optimization", "status", response.status.lowercase()).increment()
        meterRegistry.summary("playsay.html_game.image_optimization_bytes_saved").record(response.bytesSaved.toDouble())
        logger.info(
            "HTML game image optimization completed status={} inputBytes={} outputBytes={} eligibleCount={} replacedCount={} bytesSaved={} durationMs={}",
            response.status,
            response.inputBytes,
            response.outputBytes,
            response.eligibleCount,
            response.replacedCount,
            response.bytesSaved,
            response.durationMs,
        )
        return OptimizedHtmlGameUpload(
            optimizedUpload,
            HtmlGameOptimizationMetadata(
                response.status,
                response.policy,
                response.inputBytes,
                response.outputBytes,
                response.eligibleCount,
                response.replacedCount,
                response.bytesSaved,
            ),
        )
    }

    private fun validateResponse(response: HtmlGameOptimizationResult, expectedInputBytes: Int) {
        val actualOutputBytes = response.html.toByteArray(StandardCharsets.UTF_8).size
        val valid = response.policy == HTML_GAME_IMAGE_OPTIMIZATION_POLICY &&
            response.status in setOf("OPTIMIZED", "UNCHANGED") &&
            response.inputBytes == expectedInputBytes &&
            response.outputBytes == actualOutputBytes &&
            response.outputBytes <= response.inputBytes &&
            response.eligibleCount in 0..64 &&
            response.replacedCount in 0..response.eligibleCount &&
            response.bytesSaved == response.inputBytes - response.outputBytes &&
            response.durationMs in 0..60_000 &&
            (response.status != "OPTIMIZED" || response.replacedCount > 0) &&
            (response.status != "UNCHANGED" || response.replacedCount == 0)
        if (!valid) {
            meterRegistry.counter("playsay.html_game.image_optimization_failures", "reason", "invalid_response").increment()
            logger.warn("HTML game image optimization failed reason=invalid_response")
            throw ProjectResponseException.localized(
                HttpStatus.SERVICE_UNAVAILABLE,
                MetaData.ErrorCodes.MATERIAL_HTML_GAME_OPTIMIZATION_UNAVAILABLE,
            )
        }
    }

    private fun timer(status: String): Timer =
        Timer.builder("playsay.html_game.image_optimization_duration")
            .tag("status", status)
            .register(meterRegistry)

    private fun requiresOptimization(html: String): Boolean {
        val matches = embeddedRasterPattern.findAll(html).filterNot { match ->
            val payload = match.groupValues[1]
            payload.contains("\${") || payload.contains('\\') ||
                dynamicContinuationPattern.containsMatchIn(html.substring(match.range.last + 1).take(16))
        }.toList()
        val aggregateBytes = matches.sumOf { it.value.toByteArray(StandardCharsets.UTF_8).size }
        return aggregateBytes >= aggregateTriggerBytes || matches.any {
            it.value.toByteArray(StandardCharsets.UTF_8).size >= individualTriggerBytes
        }
    }

    companion object {
        private val logger = LoggerFactory.getLogger(MaterialHtmlGameOptimizationService::class.java)
        private val embeddedRasterPattern = Regex(
            """data:image/(?:png|jpe?g|webp);base64,([^"'`\s)<>,;]+)""",
            RegexOption.IGNORE_CASE,
        )
        private val dynamicContinuationPattern = Regex("""^[\"'`]\s*\+""")
        private const val individualTriggerBytes = 256 * 1024
        private const val aggregateTriggerBytes = 1024 * 1024
    }
}
