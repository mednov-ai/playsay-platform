package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.playsay.gateway.utils.MetaData

internal fun defaultMaterialDocument(
    title: String,
    objectMapper: ObjectMapper,
    messageProvider: MessageProvider,
): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("schemaVersion", 1)
        putArray("pages").add(
            objectMapper.createObjectNode().apply {
                put("id", "page-1")
                put("title", title)
                put("layout", "FLOW")
                putArray("blocks").add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-text-1")
                        put("type", "text")
                        put("title", messageProvider[MetaData.Messages.MATERIAL_NEW_BLOCK_TITLE])
                        put("body", messageProvider[MetaData.Messages.MATERIAL_NEW_BLOCK_BODY])
                    },
                )
            },
        )
    }

internal fun defaultScoringRubric(
    objectMapper: ObjectMapper,
    messageProvider: MessageProvider,
): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("maxScore", 10)
        putArray("criteria")
            .add(criteria(objectMapper, "taskCompletion", messageProvider[MetaData.Messages.RUBRIC_TASK_COMPLETION], 4))
            .add(criteria(objectMapper, "grammar", messageProvider[MetaData.Messages.RUBRIC_GRAMMAR], 2))
            .add(criteria(objectMapper, "vocabulary", messageProvider[MetaData.Messages.RUBRIC_VOCABULARY], 2))
            .add(criteria(objectMapper, "fluency", messageProvider[MetaData.Messages.RUBRIC_FLUENCY], 2))
        putArray("analysisFlags")
            .add("taskCompletion")
            .add("grammar")
            .add("vocabulary")
            .add("spelling")
    }

internal fun JsonNode.blockCount(): Int {
    val pages = get("pages")
    if (pages !is ArrayNode) {
        return 0
    }
    return pages.sumOf { page ->
        val blocks = page.get("blocks")
        if (blocks is ArrayNode) blocks.size() else 0
    }
}

private fun criteria(objectMapper: ObjectMapper, key: String, label: String, weight: Int): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("key", key)
        put("label", label)
        put("weight", weight)
    }
