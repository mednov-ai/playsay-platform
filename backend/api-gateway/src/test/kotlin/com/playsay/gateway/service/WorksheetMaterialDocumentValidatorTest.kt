package com.playsay.gateway.service

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import kotlin.test.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.junit.jupiter.api.assertThrows

class WorksheetMaterialDocumentValidatorTest {
    private val mapper = jacksonObjectMapper()
    private val validator = WorksheetMaterialDocumentValidator()

    @Test
    fun `accepts schema v2 worksheet with every overlay group and keeps v1 compatible`() {
        assertDoesNotThrow { validator.validate(validDocument()) }
        assertDoesNotThrow { validator.validate(mapper.readTree("""{"schemaVersion":1,"pages":[]}""")) }
    }

    @Test
    fun `rejects bad geometry and incorrect option references with one stable error`() {
        val geometry = validDocument()
        (geometry.at("/pages/0/blocks/0/groups/0/gaps/0/region") as ObjectNode).put("x", 950)
        assertInvalid(geometry)

        val choice = validDocument()
        (choice.at("/pages/0/blocks/0/groups/2/questions/0") as ObjectNode).putArray("correctOptionIds").add("missing")
        assertInvalid(choice)
    }

    private fun assertInvalid(document: ObjectNode) {
        val exception = assertThrows<ProjectResponseException> { validator.validate(document) }
        assertEquals(MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID, exception.errorCode)
    }

    private fun validDocument(): ObjectNode = mapper.readTree(
        """
        {
          "schemaVersion": 2,
          "pages": [{
            "id": "page-1", "title": "Worksheet", "layout": "WORKSHEET",
            "blocks": [{
              "id": "worksheet-1", "type": "interactiveWorksheet",
              "sourceAsset": "material-asset:11111111-1111-1111-1111-111111111111",
              "intrinsicWidth": 1000, "intrinsicHeight": 1400, "alt": "Worksheet page",
              "groups": [
                {"id":"gaps","order":0,"type":"FILL_GAPS","gapMode":"TYPED","wordBank":[],"gaps":[
                  {"id":"gap-1","region":{"x":100,"y":100,"width":200,"height":50},"acceptedAnswers":["is"],"options":[],"distractors":[]}
                ]},
                {"id":"pairs","order":1,"type":"MATCHING_PAIRS","pairs":[
                  {"id":"pair-1","number":1,"left":{"kind":"TEXT","text":"cat","region":{"x":100,"y":300,"width":100,"height":50}},"right":{"kind":"IMAGE","region":{"x":700,"y":300,"width":100,"height":100}}}
                ]},
                {"id":"choice","order":2,"type":"MULTIPLE_CHOICE","questions":[
                  {"id":"q1","prompt":"Choose","promptRegion":null,"correctOptionIds":["o1"],"options":[
                    {"id":"o1","order":0,"text":"Yes","region":{"x":100,"y":500,"width":100,"height":50},"confidence":1.0},
                    {"id":"o2","order":1,"text":"No","region":{"x":100,"y":600,"width":100,"height":50},"confidence":1.0}
                  ]}
                ]},
                {"id":"cards","order":3,"type":"FLASHCARDS","cards":[
                  {"id":"c1","order":0,"front":{"kind":"TEXT","text":"cat","confidence":1.0},"back":{"kind":"IMAGE","region":{"x":600,"y":700,"width":200,"height":200},"confidence":1.0}}
                ]}
              ]
            }]
          }]
        }
        """.trimIndent(),
    ) as ObjectNode
}
