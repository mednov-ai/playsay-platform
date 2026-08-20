package com.playsay.gateway.service.material

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.networknt.schema.JsonSchema
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import org.springframework.stereotype.Component

@Component
class MaterialDraftSchema(
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    private val schemaBytes: ByteArray by lazy {
        checkNotNull(javaClass.getResourceAsStream(RESOURCE_PATH)) {
            "Missing material draft schema resource $RESOURCE_PATH"
        }.use { it.readBytes() }
    }

    val node: JsonNode by lazy { objectMapper.readTree(schemaBytes) }

    private val validator: JsonSchema by lazy {
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schemaBytes.inputStream())
    }

    fun validationErrors(draft: JsonNode) = validator.validate(draft)

    private companion object {
        const val RESOURCE_PATH = "/schema/material-draft/v1/material-draft.schema.json"
    }
}
