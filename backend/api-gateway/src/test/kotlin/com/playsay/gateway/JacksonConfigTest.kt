package com.playsay.gateway

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.http.converter.HttpMessageConverter
import org.springframework.mock.http.MockHttpOutputMessage
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter

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
    private val handlerAdapter: RequestMappingHandlerAdapter,
) {
    @Test
    fun `spring object mapper serializes material JsonNode fields as raw JSON`() {
        val response = materialDraftResponse()

        val serialized = objectMapper.readTree(objectMapper.writeValueAsString(response))

        assertEquals(1, serialized["document"]["schemaVersion"].asInt())
        assertEquals("stub", serialized["sourceMeta"]["provider"].asText())
        assertEquals(10, serialized["scoringRubric"]["maxScore"].asInt())
    }

    @Test
    @Suppress("UNCHECKED_CAST")
    fun `mvc json converter serializes material JsonNode fields as raw JSON`() {
        val converter = handlerAdapter.messageConverters
            .first { candidate -> candidate.canWrite(LessonMaterialDraftResponse::class.java, MediaType.APPLICATION_JSON) }
            as HttpMessageConverter<Any>
        val output = MockHttpOutputMessage()

        converter.write(materialDraftResponse(), MediaType.APPLICATION_JSON, output)
        val serialized = objectMapper.readTree(output.bodyAsString)

        assertEquals(1, serialized["document"]["schemaVersion"].asInt())
        assertEquals("stub", serialized["sourceMeta"]["provider"].asText())
        assertEquals(10, serialized["scoringRubric"]["maxScore"].asInt())
    }

    private fun materialDraftResponse(): LessonMaterialDraftResponse {
        val nodeMapper = jacksonObjectMapper()
        return LessonMaterialDraftResponse(
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
    }
}
