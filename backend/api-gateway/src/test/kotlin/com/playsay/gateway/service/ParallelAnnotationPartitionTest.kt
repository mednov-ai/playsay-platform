package com.playsay.gateway.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ParallelAnnotationPartitionTest {
    private val mapper = jacksonObjectMapper()
    private val partition = ParallelAnnotationPartition(mapper)

    @Test
    fun `keeps inherited identifiers out of student content and retains the mixed snapshot for review`() {
        val historical = mapper.readTree("""{"schemaVersion":1,"strokes":[{"id":"legacy-a","points":[{"x":1,"y":2}]}]}""")
        val incoming = mapper.readTree("""{"schemaVersion":7,"elements":[{"id":" legacy-a ","text":"changed"},{"id":"new-a","text":"new"}]}""")
        val result = partition.split(historical, incoming)
        assertTrue(result.quarantine)
        assertEquals(listOf("new-a"), result.personal!!["elements"].map { it["id"].asText() })
        assertEquals("legacy-a", historical["strokes"][0]["id"].asText())
        assertEquals(2, incoming["elements"].size())
    }

    @Test
    fun `treats unidentifiable or unsupported historical shapes as wholly unallocated`() {
        val incoming = mapper.readTree("""{"elements":[{"id":"new"}]}""")
        for (historical in listOf(mapper.readTree("""{"strokes":[{"points":[1]}]}"""), mapper.readTree("""{"unknown":"old"}"""), mapper.readTree("""{"elements":[],"strokes":{"private":"unknown"}}"""))) {
            val result = partition.split(historical, incoming)
            assertNull(result.personal)
            assertTrue(result.quarantine)
        }
    }

    @Test
    fun `does not expose unsupported fields or missing identifiers when historical content exists`() {
        val historical = mapper.readTree("""{"strokes":[{"id":"legacy"}]}""")
        for (incoming in listOf(mapper.readTree("""{"elements":[{"id":"new"}],"extra":{"id":"legacy"}}"""), mapper.readTree("""{"elements":[{"text":"unknown"}]}"""))) {
            val result = partition.split(historical, incoming)
            assertNull(result.personal)
            assertTrue(result.quarantine)
        }
    }

    @Test
    fun `accepts a clean student layer without creating a quarantine snapshot`() {
        val historical = mapper.readTree("""{"elements":[{"id":"legacy"}]}""")
        val incoming = mapper.readTree("""{"elements":[{"id":"own"}]}""")
        val result = partition.split(historical, incoming)
        assertFalse(result.quarantine)
        assertEquals(incoming, result.personal)
    }
}
