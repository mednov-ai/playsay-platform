package com.playsay.aitutor

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertTrue

class AiTutorServiceStructureTest {
    private val sourceRoot: Path =
        Path.of("").toAbsolutePath().resolve("src/main/kotlin/com/playsay/aitutor")

    @Test
    fun `root package contains only application launcher`() {
        val misplaced = directChildren()
            .filter { Files.isRegularFile(it) && it.name.endsWith(".kt") }
            .filterNot { it.name == "AiTutorServiceApplication.kt" }
            .map { it.name }

        assertTrue(misplaced.isEmpty(), "Only AiTutorServiceApplication.kt may live in the root package: $misplaced")
    }

    @Test
    fun `module uses intentional package folders`() {
        val allowed = setOf("config", "controller", "dto", "entity", "repo", "service")
        val unexpected = directChildren()
            .filter { Files.isDirectory(it) }
            .map { it.name }
            .filterNot { it in allowed }

        assertTrue(unexpected.isEmpty(), "Unexpected top-level package folders: $unexpected")
    }

    @Test
    fun `controllers stay thin and persistence stays in repositories`() {
        val controllers = kotlinSources().filter { ".controller" in it.packageName }
        val controllerViolations = controllers
            .filter { source ->
                source.text.contains("JpaRepository") ||
                    source.text.contains("EntityManager") ||
                    source.text.contains("ObjectMapper") ||
                    Regex("""(?m)^data\s+class\s+\w+(Request|Response)\b""").containsMatchIn(source.text)
            }
            .map { it.relativePath }
        val directSqlViolations = kotlinSources()
            .filter { source ->
                source.text.contains("JdbcTemplate") ||
                    source.text.contains("JdbcClient") ||
                    source.text.contains("createNativeQuery") ||
                    (source.text.contains("nativeQuery = true") && ".repo" !in source.packageName)
            }
            .map { it.relativePath }

        assertTrue(controllerViolations.isEmpty(), "Controllers must delegate DTO and persistence work: $controllerViolations")
        assertTrue(directSqlViolations.isEmpty(), "Direct SQL access is forbidden; use JPA entities and repositories: $directSqlViolations")
    }

    private fun kotlinSources(): List<KotlinSource> = allKotlinSourcePaths().map { path ->
        val text = path.readText()
        KotlinSource(
            relativePath = sourceRoot.relativize(path).toString(),
            packageName = Regex("""(?m)^package\s+([\w.]+)$""").find(text)?.groupValues?.get(1).orEmpty(),
            text = text,
        )
    }

    private fun directChildren(): List<Path> = Files.list(sourceRoot).use { it.toList() }

    private fun allKotlinSourcePaths(): List<Path> = Files.walk(sourceRoot).use { paths ->
        paths.filter { Files.isRegularFile(it) && it.name.endsWith(".kt") }.toList()
    }

    private data class KotlinSource(val relativePath: String, val packageName: String, val text: String)
}
