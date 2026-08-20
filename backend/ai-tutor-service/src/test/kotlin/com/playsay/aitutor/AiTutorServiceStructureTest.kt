package com.playsay.aitutor

import com.playsay.architecture.KotlinSpringModuleArchitecture
import com.playsay.architecture.KotlinSpringModuleArchitectureConfig
import com.playsay.architecture.KotlinSpringModuleArchitectureTest
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertTrue

class AiTutorServiceStructureTest : KotlinSpringModuleArchitectureTest() {
    private val sourceRoot = Path.of("").toAbsolutePath().resolve("src/main/kotlin/com/playsay/aitutor")

    override val architecture = KotlinSpringModuleArchitecture(
        KotlinSpringModuleArchitectureConfig(
            basePackage = "com.playsay.aitutor",
            applicationFile = "AiTutorServiceApplication.kt",
            allowedTopLevelPackages = setOf("config", "controller", "dto", "entity", "repo", "service"),
        ),
    )

    @Test
    fun `persistence stays in repositories`() {
        val directSqlViolations = kotlinSources()
            .filter { source ->
                source.text.contains("JdbcTemplate") ||
                    source.text.contains("JdbcClient") ||
                    source.text.contains("createNativeQuery") ||
                    (source.text.contains("nativeQuery = true") && ".repo" !in source.packageName)
            }
            .map { it.relativePath }

        assertTrue(directSqlViolations.isEmpty(), "Direct SQL access is forbidden; use JPA entities and repositories: $directSqlViolations")
    }

    private fun kotlinSources(): List<KotlinSource> = Files.walk(sourceRoot).use { paths ->
        paths
            .filter { Files.isRegularFile(it) && it.name.endsWith(".kt") }
            .map { path ->
                val text = path.readText()
                KotlinSource(
                    relativePath = sourceRoot.relativize(path).toString(),
                    packageName = Regex("""(?m)^package\s+([\w.]+)$""").find(text)?.groupValues?.get(1).orEmpty(),
                    text = text,
                )
            }
            .toList()
    }

    private data class KotlinSource(val relativePath: String, val packageName: String, val text: String)
}
