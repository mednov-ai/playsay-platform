package com.playsay.gateway.mapper

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.utils.blockCount
import org.springframework.stereotype.Component

@Component
class LessonMaterialResponseMapper(
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    fun toResponse(material: LessonMaterialRow): LessonMaterialResponse {
        val documentNode = objectMapper.readTree(material.document)
        return LessonMaterialResponse(
            id = material.id,
            ownerTeacherUserId = material.ownerTeacherUserId,
            ownerTeacherSubject = material.ownerTeacherSubject,
            ownerTeacherName = material.ownerTeacherName,
            title = material.title,
            description = material.description,
            language = material.language,
            cefrLevel = material.cefrLevel,
            visibility = material.visibility,
            status = material.status,
            document = documentNode,
            sourceMeta = objectMapper.readTree(material.sourceMeta),
            scoringRubric = objectMapper.readTree(material.scoringRubric),
            blockCount = documentNode.blockCount(),
            createdAt = material.createdAt,
            updatedAt = material.updatedAt,
        )
    }
}
