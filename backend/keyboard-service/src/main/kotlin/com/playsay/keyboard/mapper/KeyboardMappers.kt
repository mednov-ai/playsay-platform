package com.playsay.keyboard.mapper

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.keyboard.dto.ChordSetResponse
import com.playsay.keyboard.dto.TrainingResultResponse
import com.playsay.keyboard.entity.ChordSetEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import jakarta.persistence.AttributeConverter
import jakarta.persistence.Converter
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

fun ChordSetEntity.toResponse(): ChordSetResponse =
    ChordSetResponse(
        id = id,
        layout = layout,
        title = title,
        difficulty = difficulty,
        chords = chords.toList(),
    )

fun TrainingResultEntity.toResponse(): TrainingResultResponse =
    TrainingResultResponse(
        id = id,
        chordSetId = chordSetId,
        speedCpm = speedCpm,
        accuracy = accuracy,
        errors = errors,
        durationMs = durationMs,
        createdAt = createdAt.toString(),
    )

fun JwtAuthenticationToken.applicationRoles(): List<String> =
    authorities
        .mapNotNull { authority -> authority.authority }
        .filter { authority -> authority.startsWith(rolePrefix) }
        .map { authority -> authority.removePrefix(rolePrefix) }
        .sorted()

@Converter
class PerFingerErrorMapConverter : AttributeConverter<Map<String, Int>, String> {
    override fun convertToDatabaseColumn(attribute: Map<String, Int>?): String =
        objectMapper.writeValueAsString(attribute.orEmpty())

    override fun convertToEntityAttribute(dbData: String?): Map<String, Int> {
        if (dbData.isNullOrBlank()) {
            return emptyMap()
        }
        return objectMapper.readValue(dbData, mapType)
    }

    private companion object {
        val objectMapper: ObjectMapper = jacksonObjectMapper()
        val mapType = object : TypeReference<Map<String, Int>>() {}
    }
}

private const val rolePrefix = "ROLE_"
