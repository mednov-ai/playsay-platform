package com.playsay.worksheetimport

import com.fasterxml.jackson.databind.ObjectMapper
import io.micrometer.core.instrument.MeterRegistry
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.MOCK,
    properties = [
        "spring.datasource.url=jdbc:h2:mem:worksheet-context;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.liquibase.enabled=false",
        "playsay.worksheet-import.enabled=false",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:9/unreachable",
    ],
)
class WorksheetImportApplicationContextTest {
    @Autowired private lateinit var objectMapper: ObjectMapper
    @Autowired private lateinit var meterRegistry: MeterRegistry

    @Test
    fun `application context provides the shared Kotlin and Java-time mapper`() {
        assertNotNull(objectMapper.registeredModuleIds.find { it.toString().contains("jsr310", ignoreCase = true) })
    }

    @Test
    fun `application context exposes a Prometheus meter registry`() {
        assertTrue(meterRegistry.javaClass.name.contains("Prometheus"))
    }
}
