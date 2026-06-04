package com.playsay.gateway.utils

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ArrayNode

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
