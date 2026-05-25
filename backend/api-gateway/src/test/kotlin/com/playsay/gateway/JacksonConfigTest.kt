package com.playsay.gateway

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:jackson-config;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=false",
    ],
)
class JacksonConfigTest @Autowired constructor(
    private val objectMapper: ObjectMapper,
) {
    @Test
    fun `spring object mapper serializes material JsonNode fields as raw JSON`() {
        val nodeMapper = jacksonObjectMapper()
        val response = LessonMaterialDraftResponse(
            title = "JSON smoke",
            description = null,
            language = "en",
            cefrLevel = "A2",
            visibility = "PRIVATE",
            status = "DRAFT",
            document = nodeMapper.readTree("""{"schemaVersion":1,"pages":[{"id":"page-1","blocks":[]}]}"""),
            sourceMeta = nodeMapper.readTree("""{"kind":"AI_STUB","provider":"stub"}"""),
            scoringRubric = nodeMapper.readTree("""{"maxScore":10,"analysisFlags":["grammar"]}"""),
        )

        val serialized = objectMapper.readTree(objectMapper.writeValueAsString(response))

        assertEquals(1, serialized["document"]["schemaVersion"].asInt())
        assertEquals("stub", serialized["sourceMeta"]["provider"].asText())
        assertEquals(10, serialized["scoringRubric"]["maxScore"].asInt())
    }
}
