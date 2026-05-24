package com.playsay.gateway

import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.createDirectories
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertTrue
import org.junit.jupiter.api.condition.EnabledIfSystemProperty
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.SpringBootTest

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfSystemProperty(named = "playsay.openapi.export", matches = "true")
class OpenApiExportTest {
    @Value("\${local.server.port}")
    private var port: Int = 0

    @Test
    fun `exports OpenAPI yaml contract`() {
        val yaml = URI("http://localhost:$port/v3/api-docs.yaml")
            .toURL()
            .readText()
        val output = Path.of(System.getProperty("playsay.openapi.output")).toAbsolutePath().normalize()

        output.parent.createDirectories()
        output.writeText(yaml)

        assertTrue(Files.isRegularFile(output))
        assertTrue(yaml.contains("openapi:"))
        assertTrue(yaml.contains("operationId: getMe"))
    }
}
