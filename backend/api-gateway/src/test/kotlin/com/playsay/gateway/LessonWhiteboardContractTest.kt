package com.playsay.gateway

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

class LessonWhiteboardContractTest {
    private val mapper = jacksonObjectMapper()
    private val factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012)
    private fun schema(name: String) = factory.getSchema(mapper.readTree(Files.readString(Path.of("..", "..", "contracts", name))))

    @Test fun `versioned board controls require durable deletion metadata and canonical camera geometry`() {
        val contract = schema("lesson-whiteboard-control.schema.json")
        listOf(
            """{"type":"hello","version":1,"whiteboard":true}""",
            """{"type":"camera","version":1,"sourceClientId":7,"region":{"x":-100,"y":20,"width":900,"height":500}}""",
            """{"type":"persisted","version":1,"contentEpoch":2,"stateVector":"AA==","deleteSet":"AAA="}""",
        ).forEach { assertTrue(contract.validate(mapper.readTree(it)).isEmpty(), it) }
        listOf(
            """{"type":"hello","version":2,"whiteboard":true}""",
            """{"type":"persisted","version":1,"contentEpoch":2,"stateVector":"AA=="}""",
            """{"type":"camera","version":1,"sourceClientId":7,"region":{"x":0,"y":0,"width":0,"height":500}}""",
        ).forEach { assertTrue(contract.validate(mapper.readTree(it)).isNotEmpty(), it) }
    }

    @Test fun `lesson notification carries no individual context or snapshot payload`() {
        val contract = schema("websocket-messages.schema.json")
        val message = mapper.readTree("""{"type":"lesson.whiteboard.changed","lessonId":"11111111-1111-4111-8111-111111111111"}""")
        assertTrue(contract.validate(message).isEmpty())
        (message as com.fasterxml.jackson.databind.node.ObjectNode).put("studentSubject", "private-target")
        assertTrue(contract.validate(message).isNotEmpty())
    }
}
