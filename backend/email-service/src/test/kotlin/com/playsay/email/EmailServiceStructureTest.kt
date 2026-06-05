package com.playsay.email

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertTrue

class EmailServiceStructureTest {
    private val sourceRoot: Path =
        Path.of("").toAbsolutePath().resolve("src/main/kotlin/com/playsay/email")

    @Test
    fun `root package contains only application launcher`() {
        val misplacedRootFiles = directChildren()
            .filter { path -> Files.isRegularFile(path) }
            .filter { path -> path.name.endsWith(".kt") }
            .filterNot { path -> path.name == "EmailServiceApplication.kt" }
            .map { path -> path.name }

        assertTrue(
            misplacedRootFiles.isEmpty(),
            "Only EmailServiceApplication.kt may live in com.playsay.email root package: $misplacedRootFiles",
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
                    source.text.contains("JavaMailSender")
            }
            .map { source -> source.relativePath }

        assertTrue(
            controllerViolations.isEmpty(),
            "Controllers must not own DTOs, JSON parsing, repositories, or mail clients: $controllerViolations",
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
        if (!Files.exists(sourceRoot)) {
            return emptyList()
        }
        val paths = Files.list(sourceRoot)
        return try {
            paths.toList()
        } finally {
            paths.close()
        }
    }

    private fun allKotlinSourcePaths(): List<Path> {
        if (!Files.exists(sourceRoot)) {
            return emptyList()
        }
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
