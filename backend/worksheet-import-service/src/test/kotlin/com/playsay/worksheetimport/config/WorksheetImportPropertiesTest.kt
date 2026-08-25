package com.playsay.worksheetimport.config

import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

class WorksheetImportPropertiesTest {
    @Test
    fun `defaults are bounded and creation is disabled`() {
        val properties = WorksheetImportProperties()
        properties.validate()
        assertFalse(properties.enabled)
    }

    @Test
    fun `enabled import requires a service token`() {
        val properties = WorksheetImportProperties(enabled = true)
        assertFailsWith<IllegalArgumentException> { properties.validate() }
    }

    @Test
    fun `packet must support acceptance size while retaining a finite bound`() {
        assertFailsWith<IllegalArgumentException> {
            WorksheetImportProperties(packet = WorksheetImportProperties.Packet(maxPages = 7)).validate()
        }
        assertFailsWith<IllegalArgumentException> {
            WorksheetImportProperties(packet = WorksheetImportProperties.Packet(maxPages = 201)).validate()
        }
    }
}
