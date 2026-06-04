package com.playsay.media

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertTrue

class MediaServiceStructureTest {
    private val sourceRoot: Path =
        Path.of("").toAbsolutePath().resolve("src/main/kotlin/com/playsay/media")

    @Test
    fun `root package contains only application launcher`() {
        val misplacedRootFiles = directChildren()
            .filter { path -> Files.isRegularFile(path) }
            .filter { path -> path.name.endsWith(".kt") }
            .filterNot { path -> path.name == "MediaServiceApplication.kt" }
            .map { path -> path.name }

        assertTrue(
            misplacedRootFiles.isEmpty(),
            "Only MediaServiceApplication.kt may live in com.playsay.media root package: $misplacedRootFiles",
        )
    }

    @Test
    fun `module uses only approved package folders`() {
        val allowedFolders = setOf("config", "controller", "dto", "service", "entity", "repo", "mapper", "utils")
        val unapprovedFolders = directChildren()
            .filter { path -> Files.isDirectory(path) }
            .map { path -> path.name }
            .filter { name -> name !in allowedFolders }

        assertTrue(
            unapprovedFolders.isEmpty(),
            "Kotlin Spring Boot module folders must use the approved package contract: $unapprovedFolders",
        )
    }

    @Test
    fun `rest controllers are isolated in controller package`() {
        val misplacedControllers = kotlinSources()
            .filter { source -> Regex("""(?m)^@RestController$""").containsMatchIn(source.text) }
            .filterNot { source -> ".controller" in source.packageName }
            .map { source -> source.relativePath }

        assertTrue(
            misplacedControllers.isEmpty(),
            "REST controllers must live in com.playsay.media.controller: $misplacedControllers",
        )
    }

    @Test
    fun `request and response dto classes are isolated in dto package`() {
        val dtoRegex = Regex("""(?m)^data\s+class\s+\w+(Request|Response)\b""")
        val misplacedDtos = kotlinSources()
            .filter { source -> dtoRegex.containsMatchIn(source.text) }
            .filterNot { source -> ".dto" in source.packageName }
            .map { source -> source.relativePath }

        assertTrue(
            misplacedDtos.isEmpty(),
            "Request/response DTOs must live in com.playsay.media.dto: $misplacedDtos",
        )
    }

    @Test
    fun `controllers stay thin`() {
        val controllerViolations = kotlinSources()
            .filter { source -> ".controller" in source.packageName }
            .filter { source ->
                Regex("""(?m)^data\s+class\s+\w+(Request|Response)\b""").containsMatchIn(source.text) ||
                    source.text.contains("ObjectMapper") ||
                    source.text.contains(".readTree(") ||
                    source.text.contains(".writeValueAsString(") ||
                    source.text.contains("JpaRepository<") ||
                    source.text.contains("CrudRepository<") ||
                    source.text.contains("HttpClient")
            }
            .map { source -> source.relativePath }

        assertTrue(
            controllerViolations.isEmpty(),
            "Controllers must not own DTOs, JSON parsing, repositories, or low-level HTTP clients: $controllerViolations",
        )
    }

    private fun kotlinSources(): List<KotlinSource> =
        allKotlinSourcePaths().map { path ->
            val text = path.readText()
            KotlinSource(
                relativePath = sourceRoot.relativize(path).toString(),
                packageName = Regex("""(?m)^package\s+([\w.]+)$""")
                    .find(text)
                    ?.groupValues
                    ?.get(1)
                    .orEmpty(),
                text = text,
            )
        }

    private fun directChildren(): List<Path> {
        val paths = Files.list(sourceRoot)
        return try {
            paths.toList()
        } finally {
            paths.close()
        }
    }

    private fun allKotlinSourcePaths(): List<Path> {
        val paths = Files.walk(sourceRoot)
        return try {
            paths
                .filter { path -> Files.isRegularFile(path) && path.name.endsWith(".kt") }
                .toList()
        } finally {
            paths.close()
        }
    }

    private data class KotlinSource(
        val relativePath: String,
        val packageName: String,
        val text: String,
    )
}
