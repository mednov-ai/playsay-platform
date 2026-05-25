package com.playsay.gateway

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.awt.Color
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.Base64
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import javax.imageio.stream.MemoryCacheImageOutputStream
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

data class MaterialImageGenerationInput(
    val prompt: String,
    val alt: String,
)

data class GeneratedMaterialImage(
    val bytes: ByteArray,
    val model: String,
    val prompt: String,
    val revisedPrompt: String?,
    val mimeType: String,
)

@Component
class MaterialImageGenerationService(
    @param:Value("\${playsay.ai.provider:stub}") private val provider: String,
    private val stubProvider: StubMaterialImageGenerationProvider,
    private val openAiProvider: OpenAiMaterialImageGenerationProvider,
) {
    fun generate(input: MaterialImageGenerationInput): GeneratedMaterialImage =
        when (provider.trim().lowercase()) {
            "", "stub" -> stubProvider.generate(input)
            "openai" -> openAiProvider.generate(input)
            else -> throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Unknown AI material provider.")
        }
}

@Component
class StubMaterialImageGenerationProvider {
    fun generate(input: MaterialImageGenerationInput): GeneratedMaterialImage {
        val safeAlt = input.alt.take(80).ifBlank { "generated picture" }
        val svg = """
            <svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 384 384">
              <rect width="384" height="384" rx="48" fill="#fff7f1"/>
              <circle cx="142" cy="136" r="78" fill="#ffe07a"/>
              <circle cx="245" cy="232" r="86" fill="#c9f2e3"/>
              <path d="M191 94l17 49 49 17-49 17-17 49-17-49-49-17 49-17 17-49z" fill="#ff5c00"/>
            </svg>
        """.trimIndent()
        return GeneratedMaterialImage(
            bytes = svg.toByteArray(StandardCharsets.UTF_8),
            model = "stub",
            prompt = materialImageGenerationPrompt(input.prompt, safeAlt),
            revisedPrompt = null,
            mimeType = "image/svg+xml",
        )
    }
}

@Component
class OpenAiMaterialImageGenerationProvider(
    private val transport: OpenAiImagesTransport,
    @param:Value("\${playsay.ai.openai.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.ai.openai.image-model:gpt-image-1-mini}") private val imageModel: String,
    @param:Value("\${playsay.ai.openai.base-url:https://api.openai.com/v1}") private val baseUrl: String,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun generate(input: MaterialImageGenerationInput): GeneratedMaterialImage {
        val cleanApiKey = apiKey.trim()
        val cleanModel = imageModel.trim().ifEmpty { "gpt-image-1-mini" }
        val cleanBaseUrl = baseUrl.trim().ifEmpty { "https://api.openai.com/v1" }
        if (cleanApiKey.isEmpty()) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "OpenAI API key is not configured.")
        }

        val prompt = materialImageGenerationPrompt(input.prompt, input.alt)
        val requestBody = objectMapper.writeValueAsString(openAiImageRequest(prompt, cleanModel))
        val rawResponse = try {
            transport.createImage(cleanBaseUrl, cleanApiKey, requestBody)
        } catch (exception: OpenAiTransportException) {
            val status = if (exception.statusCode in setOf(401, 403)) {
                HttpStatus.SERVICE_UNAVAILABLE
            } else {
                HttpStatus.BAD_GATEWAY
            }
            throw ResponseStatusException(status, "OpenAI image generation failed.")
        } catch (exception: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI image generation failed.")
        }

        val responseNode = parseJson(rawResponse)
        val data = responseNode.get("data") as? ArrayNode
        val imageNode = data?.firstOrNull()
            ?: throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI image response did not contain data.")
        val base64Image = imageNode.get("b64_json")?.takeIf { node -> node.isTextual }?.asText()?.trim()
            ?: throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI image response did not contain image bytes.")
        val compactBytes = compactJpegBytes(base64Image)

        return GeneratedMaterialImage(
            bytes = compactBytes,
            model = cleanModel,
            prompt = prompt,
            revisedPrompt = imageNode.get("revised_prompt")?.takeIf { node -> node.isTextual }?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() },
            mimeType = "image/jpeg",
        )
    }

    private fun openAiImageRequest(prompt: String, cleanModel: String): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("model", cleanModel)
            put("prompt", prompt)
            put("n", 1)
            put("size", "1024x1024")
            put("quality", "low")
            put("output_format", "png")
            put("background", "opaque")
        }

    private fun parseJson(raw: String): JsonNode =
        runCatching { objectMapper.readTree(raw) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI image response was not valid JSON.") }
}

interface OpenAiImagesTransport {
    fun createImage(baseUrl: String, apiKey: String, requestBody: String): String
}

@Component
class JavaOpenAiImagesTransport : OpenAiImagesTransport {
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()

    override fun createImage(baseUrl: String, apiKey: String, requestBody: String): String {
        val endpoint = "${baseUrl.trimEnd('/')}/images/generations"
        val request = HttpRequest.newBuilder(URI.create(endpoint))
            .timeout(Duration.ofSeconds(90))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
            .build()

        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
        if (response.statusCode() !in 200..299) {
            throw OpenAiTransportException(response.statusCode())
        }
        return response.body()
    }
}

private fun materialImageGenerationPrompt(prompt: String, alt: String): String {
    val subject = alt.trim().ifBlank { "the target vocabulary word" }
    val basePrompt = prompt.trim().ifBlank { "A child-friendly workbook picture of $subject." }
    return """
        $basePrompt

        Create a new original illustration for a children's English workbook matching exercise.
        Show one clear centered object or character for: $subject.
        Use a bright friendly vector-like style, white or very light background, simple silhouette, no clutter.
        Do not include text, letters, numbers, labels, logos, watermarks, copied worksheet art, or realistic photo backgrounds.
    """.trimIndent()
}

private fun compactJpegBytes(base64Image: String): ByteArray {
    val sourceBytes = Base64.getDecoder().decode(base64Image)
    val source = ImageIO.read(ByteArrayInputStream(sourceBytes))
        ?: return sourceBytes
    val canvasSize = 384
    val canvas = BufferedImage(canvasSize, canvasSize, BufferedImage.TYPE_INT_RGB)
    val graphics = canvas.createGraphics()
    try {
        graphics.color = Color.WHITE
        graphics.fillRect(0, 0, canvasSize, canvasSize)
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
        graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        val scale = minOf(canvasSize.toDouble() / source.width, canvasSize.toDouble() / source.height)
        val width = (source.width * scale).toInt().coerceAtLeast(1)
        val height = (source.height * scale).toInt().coerceAtLeast(1)
        val x = (canvasSize - width) / 2
        val y = (canvasSize - height) / 2
        graphics.drawImage(source, x, y, width, height, null)
    } finally {
        graphics.dispose()
    }

    val output = ByteArrayOutputStream()
    val writer = ImageIO.getImageWritersByFormatName("jpeg").asSequence().firstOrNull()
        ?: return sourceBytes
    writer.output = MemoryCacheImageOutputStream(output)
    try {
        val params = writer.defaultWriteParam
        if (params.canWriteCompressed()) {
            params.compressionMode = ImageWriteParam.MODE_EXPLICIT
            params.compressionQuality = 0.82f
        }
        writer.write(null, IIOImage(canvas, null, null), params)
    } finally {
        writer.dispose()
    }

    return output.toByteArray()
}
