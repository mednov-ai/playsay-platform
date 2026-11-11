package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode

/** Prevent an old tab from re-attributing the historical shared layer to its current student. */
internal class ParallelAnnotationPartition(private val mapper: ObjectMapper) {
    data class Result(val personal: JsonNode?, val quarantine: Boolean)

    fun split(historical: JsonNode?, incoming: JsonNode): Result {
        if (historical == null || isKnownEmpty(incoming)) return Result(incoming, false)
        val historicalIds = historicalIds(historical) ?: return Result(null, true)
        if (historicalIds.isEmpty()) return Result(incoming, false)
        val incomingObject = incoming as? ObjectNode ?: return Result(null, true)
        val incomingArrays = validatedArrays(incomingObject) ?: return Result(null, true)
        if (incomingArrays.any { (_, value) -> value.any { stableId(it) == null } }) return Result(null, true)

        var overlap = false
        val personal = incomingObject.deepCopy()
        incomingArrays.forEach { (name, array) ->
            val clean = mapper.createArrayNode()
            array.forEach { element ->
                if (stableId(element) in historicalIds) overlap = true else clean.add(element)
            }
            personal.set<ArrayNode>(name, clean)
        }
        return Result(personal, overlap)
    }

    private fun historicalIds(node: JsonNode): Set<String>? {
        val arrays = validatedArrays(node as? ObjectNode ?: return null) ?: return null
        return arrays.flatMap { (_, value) -> value.toList() }.map { stableId(it) ?: return null }.toSet()
    }

    private fun validatedArrays(node: ObjectNode): List<Pair<String, JsonNode>>? {
        if (node.fieldNames().asSequence().any { it !in knownFields }) return null
        val arrays = arrayFields.mapNotNull { name -> node.get(name)?.let { name to it } }
        if (arrays.isEmpty() || arrays.any { (_, value) -> !value.isArray }) return null
        return arrays
    }

    private fun isKnownEmpty(node: JsonNode): Boolean {
        val value = node as? ObjectNode ?: return false
        if (value.fieldNames().asSequence().any { it !in knownFields }) return false
        val arrays = arrayFields.mapNotNull { name -> value.get(name) }
        return arrays.isNotEmpty() && arrays.all { it.isArray && it.isEmpty }
    }

    private fun stableId(node: JsonNode): String? = node.get("id")
        ?.takeIf { it.isTextual }?.asText()?.trim()?.takeIf(String::isNotEmpty)

    private companion object {
        val arrayFields = listOf("elements", "strokes")
        val knownFields = setOf("schemaVersion", "activePageId", "coordinateSpace", "elements", "strokes")
    }
}
