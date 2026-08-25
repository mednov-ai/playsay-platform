package com.playsay.worksheetimport

import com.playsay.architecture.KotlinSpringModuleArchitecture
import com.playsay.architecture.KotlinSpringModuleArchitectureConfig
import com.playsay.architecture.KotlinSpringModuleArchitectureTest
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WorksheetImportArchitectureTest : KotlinSpringModuleArchitectureTest() {
    private val projectRoot = Path.of("").toAbsolutePath()
    private val sourceRoot = projectRoot.resolve("src/main/kotlin/com/playsay/worksheetimport")

    override val architecture = KotlinSpringModuleArchitecture(
        KotlinSpringModuleArchitectureConfig(
            basePackage = "com.playsay.worksheetimport",
            applicationFile = "WorksheetImportServiceApplication.kt",
            allowedTopLevelPackages = setOf("ai", "config", "controller", "domain", "dto", "entity", "pdf", "repo", "service", "storage", "worker"),
            controllerForbiddenTypes = setOf("Repo", "Repository", "ObjectStorage", "PdfRasterizer"),
            forbiddenPackageDependencies = mapOf(
                "controller" to setOf("entity", "repo", "storage", "pdf", "ai", "worker"),
                "dto" to setOf("controller", "entity", "repo"),
                "domain" to setOf("controller", "dto", "entity", "repo", "service", "config", "ai", "storage", "pdf", "worker"),
                "entity" to setOf("controller", "service", "ai", "storage", "pdf", "worker"),
                "repo" to setOf("controller", "service", "ai", "storage", "pdf", "worker"),
            ),
        ),
    )

    @Test
    fun `service has no implementation dependency on api gateway`() {
        val sources = Files.walk(sourceRoot).use { paths ->
            paths.filter { Files.isRegularFile(it) && it.toString().endsWith(".kt") }.toList()
        }
        val gatewayImports = sources.filter { it.readText().contains("import com.playsay.gateway") }
        assertTrue(gatewayImports.isEmpty(), "Worksheet import must not import gateway implementation: $gatewayImports")
        assertFalse(projectRoot.resolve("build.gradle.kts").readText().contains("project(\":api-gateway\")"))
    }

    @Test
    fun `service owns import persistence and heavy processing packages`() {
        val expectedPackages = setOf("domain", "config")
        val actualPackages = Files.list(sourceRoot).use { paths ->
            paths.filter(Files::isDirectory).map { it.fileName.toString() }.toList().toSet()
        }
        assertTrue(actualPackages.containsAll(expectedPackages), "Missing service-owned packages: ${expectedPackages - actualPackages}")
    }

    @Test
    fun `diagnostic dimensions cannot contain worksheet or learner content`() {
        val forbidden = listOf("sessionId", "ownerSubject", "fileName", "storageKey", "prompt", "answer", "correctOption", "back", "learner")
        val metricLines = Files.walk(sourceRoot).use { paths ->
            paths.filter { Files.isRegularFile(it) && it.toString().endsWith(".kt") }
                .flatMap { file -> Files.readAllLines(file).stream().filter { line -> "Metrics." in line } }
                .toList()
        }
        forbidden.forEach { token ->
            assertTrue(metricLines.none { line -> token in line }, "Sensitive metric dimension '$token' found: $metricLines")
        }
    }
}
