package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*
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

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "spring.datasource.url=jdbc:h2:mem:openapi-export;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
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
        listOf(
            "operationId: listMaterials",
            "operationId: createMaterial",
            "operationId: getMaterial",
            "operationId: updateMaterial",
            "operationId: draftMaterialFromUrl",
            "operationId: draftMaterialWithAi",
            "operationId: appendMaterialImagePage",
            "operationId: uploadMaterialImageAsset",
            "operationId: getMaterialAssetContent",
            "operationId: saveScheduledLessonMaterialSubmission",
            "operationId: getScheduledLessonMaterialSubmission",
            "operationId: createWorksheetImport",
            "operationId: materializeWorksheetImport",
        ).forEach { operation ->
            assertTrue(yaml.contains(operation), "OpenAPI operation disappeared: $operation")
        }
    }
}
