package com.playsay.worksheetimport.ai

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.playsay.openai.OpenAiResponsesTransport
import com.playsay.openai.validatedOpenAiReasoningEffort
import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetPacketResolution
import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageDescriptor
import java.util.Base64
import java.util.UUID
import org.springframework.stereotype.Component

interface WorksheetAnalysisProvider {
    fun analyzePage(page: WorksheetPageDescriptor, rasterBytes: ByteArray, mimeType: String): WorksheetPageAnalysis
    fun resolvePacket(orderedPageIds: List<UUID>, analyses: List<WorksheetPageAnalysis>): WorksheetPacketResolution
}

class WorksheetAnalysisProviderException : RuntimeException("Worksheet analysis provider failed.")

@Component
class OpenAiWorksheetAnalysisProvider(
    private val transport: OpenAiResponsesTransport,
    private val properties: WorksheetImportProperties,
    private val objectMapper: ObjectMapper,
    private val prompts: WorksheetAnalysisPromptBuilder,
    private val validator: WorksheetAnalysisValidator,
) : WorksheetAnalysisProvider {
    private val config get() = properties.analysis
    private val reasoningEffort by lazy { validatedOpenAiReasoningEffort(config.reasoningEffort, "medium") }
    private val pageSchema: ObjectNode by lazy { strictSchema(resource("/ai/worksheet-page-analysis-v1.schema.json")) }
    private val packetSchema: ObjectNode by lazy {
        strictSchema(resource("/ai/worksheet-packet-resolution-v1.schema.json")).also { packet ->
            val pages = packet.path("properties").path("pages") as ObjectNode
            val embeddedPageSchema: ObjectNode = pageSchema.deepCopy()
            packet.set<JsonNode>("\$defs", embeddedPageSchema.remove("\$defs"))
            pages.set<JsonNode>("items", embeddedPageSchema)
        }
    }

    override fun analyzePage(page: WorksheetPageDescriptor, rasterBytes: ByteArray, mimeType: String): WorksheetPageAnalysis {
        if (rasterBytes.isEmpty() || rasterBytes.size > config.maxVisionBytes || mimeType !in SUPPORTED_RASTERS) {
            throw WorksheetAnalysisProviderException()
        }
        val dataUrl = "data:$mimeType;base64,${Base64.getEncoder().encodeToString(rasterBytes)}"
        val request = request(
            schemaName = "worksheet_page_analysis_v1",
            schema = pageSchema,
            messages = listOf(
                message("system", prompts.pageSystemPrompt()),
                message("user", prompts.pageUserPrompt(page), dataUrl),
            ),
        )
        return validator.parsePage(call(request), page.id)
    }

    override fun resolvePacket(orderedPageIds: List<UUID>, analyses: List<WorksheetPageAnalysis>): WorksheetPacketResolution {
        val input = prompts.packetUserPrompt(orderedPageIds, analyses) +
            "\nValidated page JSON:\n" + objectMapper.writeValueAsString(analyses)
        val request = request(
            schemaName = "worksheet_packet_resolution_v1",
            schema = packetSchema,
            messages = listOf(message("system", prompts.packetSystemPrompt()), message("user", input)),
        )
        return validator.parsePacket(call(request), orderedPageIds)
    }

    private fun call(body: ObjectNode): String {
        val apiKey = config.apiKey.trim()
        if (apiKey.isEmpty()) throw WorksheetAnalysisProviderException()
        val raw = try {
            transport.createBoundedResponse(
                config.baseUrl.trimEnd('/'), apiKey, objectMapper.writeValueAsString(body),
                config.requestTimeout, config.maxResponseBytes,
            )
        } catch (_: Exception) {
            throw WorksheetAnalysisProviderException()
        }
        val response = runCatching { objectMapper.readTree(raw) }.getOrElse { throw WorksheetAnalysisProviderException() }
        return response.outputText() ?: throw WorksheetAnalysisProviderException()
    }

    private fun request(schemaName: String, schema: ObjectNode, messages: List<ObjectNode>): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("model", config.model.trim())
            put("max_output_tokens", 12_000)
            set<JsonNode>("reasoning", objectMapper.createObjectNode().put("effort", reasoningEffort))
            putArray("input").addAll(messages)
            set<JsonNode>("text", objectMapper.createObjectNode().set<JsonNode>(
                "format",
                objectMapper.createObjectNode().put("type", "json_schema").put("name", schemaName).put("strict", true).set<JsonNode>("schema", schema),
            ))
        }

    private fun message(role: String, text: String, imageDataUrl: String? = null): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("role", role)
            putArray("content").apply {
                add(objectMapper.createObjectNode().put("type", "input_text").put("text", text))
                imageDataUrl?.let { add(objectMapper.createObjectNode().put("type", "input_image").put("image_url", it).put("detail", "high")) }
            }
        }

    private fun resource(path: String): ObjectNode = javaClass.getResourceAsStream(path).use { input ->
        if (input == null) throw IllegalStateException("Worksheet analysis schema is missing")
        objectMapper.readTree(input) as ObjectNode
    }

    private fun strictSchema(schema: ObjectNode): ObjectNode = schema.deepCopy().also { root ->
        root.remove(listOf("\$schema", "\$id"))
        requireAllObjectProperties(root)
    }

    private fun requireAllObjectProperties(node: JsonNode) {
        if (node.isObject) {
            val objectNode = node as ObjectNode
            normalizeOpenAiSchemaNode(objectNode)
            val properties = objectNode.get("properties") as? ObjectNode
            if (objectNode.path("type").asText() == "object" && properties != null) {
                val required = objectMapper.createArrayNode()
                properties.fieldNames().forEachRemaining(required::add)
                objectNode.set<ArrayNode>("required", required)
            }
            objectNode.fields().forEachRemaining { (_, child) -> requireAllObjectProperties(child) }
        } else if (node.isArray) {
            node.forEach(::requireAllObjectProperties)
        }
    }

    private fun normalizeOpenAiSchemaNode(node: ObjectNode) {
        node.remove("uniqueItems")
        if (node.has("type")) return
        if (node.has("const")) {
            node.put("type", jsonSchemaType(node.get("const")))
            return
        }
        if (!node.path("enum").isArray) return
        val types = node.path("enum").map(::jsonSchemaType).distinct()
        if (types.size == 1) node.put("type", types.single())
        else node.putArray("type").also { typeArray -> types.forEach(typeArray::add) }
    }

    private fun jsonSchemaType(node: JsonNode): String = when {
        node.isNull -> "null"
        node.isTextual -> "string"
        node.isIntegralNumber -> "integer"
        node.isNumber -> "number"
        node.isBoolean -> "boolean"
        node.isArray -> "array"
        else -> "object"
    }

    private fun JsonNode.outputText(): String? {
        get("output_text")?.takeIf(JsonNode::isTextual)?.asText()?.trim()?.takeIf(String::isNotEmpty)?.let { return it }
        (get("output") as? ArrayNode)?.forEach { item ->
            (item.get("content") as? ArrayNode)?.forEach { content ->
                content.get("text")?.takeIf(JsonNode::isTextual)?.asText()?.trim()?.takeIf(String::isNotEmpty)?.let { return it }
            }
        }
        return null
    }

    private companion object {
        val SUPPORTED_RASTERS = setOf("image/png", "image/jpeg", "image/webp")
    }
}
