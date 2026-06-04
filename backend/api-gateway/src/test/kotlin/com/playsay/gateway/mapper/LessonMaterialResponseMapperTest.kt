package com.playsay.gateway.mapper

import com.playsay.gateway.repo.LessonMaterialRow
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

class LessonMaterialResponseMapperTest {
    private val mapper = LessonMaterialResponseMapper()

    @Test
    fun `maps material row json into response and counts blocks`() {
        val materialId = UUID.randomUUID()
        val now = Instant.parse("2026-06-02T00:00:00Z")
        val row = LessonMaterialRow(
            id = materialId,
            ownerTeacherUserId = UUID.randomUUID(),
            ownerTeacherSubject = "teacher-1",
            ownerTeacherName = "Teacher One",
            title = "Pets",
            description = "Animal words",
            language = "en",
            cefrLevel = "A1",
            visibility = "PUBLIC",
            status = "PUBLISHED",
            document = """
                {
                  "schemaVersion": 1,
                  "pages": [
                    {"id": "p1", "blocks": [{"id": "b1"}, {"id": "b2"}]},
                    {"id": "p2", "blocks": [{"id": "b3"}]}
                  ]
                }
            """.trimIndent(),
            sourceMeta = """{"kind":"MANUAL"}""",
            scoringRubric = """{"maxScore":10}""",
            createdAt = now,
            updatedAt = now,
        )

        val response = mapper.toResponse(row)

        assertEquals(materialId, response.id)
        assertEquals("Pets", response.title)
        assertEquals("MANUAL", response.sourceMeta["kind"].asText())
        assertEquals(10, response.scoringRubric["maxScore"].asInt())
        assertEquals(3, response.blockCount)
    }
}
