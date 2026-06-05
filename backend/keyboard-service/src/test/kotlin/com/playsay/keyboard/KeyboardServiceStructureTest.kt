package com.playsay.keyboard

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertTrue

class KeyboardServiceStructureTest {
    private val sourceRoot: Path =
        Path.of("").toAbsolutePath().resolve("src/main/kotlin/com/playsay/keyboard")

    @Test
    fun `root package contains only application launcher`() {
        val misplacedRootFiles = directChildren()
            .filter { path -> Files.isRegularFile(path) }
            .filter { path -> path.name.endsWith(".kt") }
            .filterNot { path -> path.name == "KeyboardServiceApplication.kt" }
            .map { path -> path.name }

        assertTrue(
            misplacedRootFiles.isEmpty(),
            "Only KeyboardServiceApplication.kt may live in com.playsay.keyboard root package: $misplacedRootFiles",
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
            "REST controllers must live in com.playsay.keyboard.controller: $misplacedControllers",
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
            "Request/response DTOs must live in com.playsay.keyboard.dto: $misplacedDtos",
        )
    }

    @Test
    fun `jpa entities are isolated in entity package`() {
        val misplacedEntities = kotlinSources()
            .filter { source -> Regex("""(?m)^@Entity$""").containsMatchIn(source.text) }
            .filterNot { source -> ".entity" in source.packageName }
            .map { source -> source.relativePath }

        assertTrue(
            misplacedEntities.isEmpty(),
            "JPA entities must live in com.playsay.keyboard.entity: $misplacedEntities",
        )
    }

    @Test
    fun `repositories are isolated in repo package`() {
        val misplacedRepositories = kotlinSources()
            .filter { source -> source.text.contains("JpaRepository<") || source.text.contains("CrudRepository<") }
            .filterNot { source -> ".repo" in source.packageName }
            .map { source -> source.relativePath }

        assertTrue(
            misplacedRepositories.isEmpty(),
            "Spring Data repositories must live in com.playsay.keyboard.repo: $misplacedRepositories",
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
                    source.text.contains("CrudRepository<")
            }
            .map { source -> source.relativePath }

        assertTrue(
            controllerViolations.isEmpty(),
            "Controllers must not own DTOs, JSON parsing, repositories, or low-level persistence: $controllerViolations",
        )
    }

    @Test
    fun `anonymous keyboard endpoints are explicitly public`() {
        val securityConfig = sourceRoot.resolve("config/SecurityConfig.kt").readText()

        assertTrue(
            securityConfig.contains("\"/api/anonymous/**\""),
            "SecurityConfig must keep anonymous keyboard ingestion public while protected progress APIs stay authenticated.",
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
