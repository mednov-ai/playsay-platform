package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertTrue

class BackendArchitectureTest {
    private val sourceRoot: Path =
        Path.of("").toAbsolutePath().resolve("src/main/kotlin/com/playsay/gateway")

    @Test
    fun `rest controllers are isolated in controller package`() {
        val misplacedControllers = kotlinSources()
            .filter { source -> Regex("""(?m)^@RestController$""").containsMatchIn(source.text) }
            .filterNot { source -> ".controller" in source.packageName }
            .map { source -> source.relativePath }

        assertTrue(
            misplacedControllers.isEmpty(),
            "REST controllers must live in com.playsay.gateway.controller: $misplacedControllers",
        )
    }

    @Test
    fun `openapi request and response dto classes are isolated in dto package`() {
        val dtoRegex = Regex("""(?m)^data\s+class\s+\w+(Request|Response)\b""")
        val misplacedDtos = kotlinSources()
            .filter { source -> dtoRegex.containsMatchIn(source.text) }
            .filterNot { source -> ".error" in source.packageName }
            .filterNot { source -> ".dto" in source.packageName }
            .map { source -> source.relativePath }

        assertTrue(
            misplacedDtos.isEmpty(),
            "OpenAPI request/response DTOs must live in com.playsay.gateway.dto: $misplacedDtos",
        )
    }

    @Test
    fun `application services are isolated in service package`() {
        val serviceComponentRegex = Regex("""@(Component|Service)\s+class\s+\w+(Service|Store|Provider|Transport)\b""")
        val misplacedServices = kotlinSources()
            .filter { source -> serviceComponentRegex.containsMatchIn(source.text) }
            .filterNot { source -> ".service" in source.packageName }
            .map { source -> source.relativePath }

        assertTrue(
            misplacedServices.isEmpty(),
            "Service/store/provider components must live in com.playsay.gateway.service: $misplacedServices",
        )
    }

    @Test
    fun `liquibase tables have jpa entities`() {
        val entitySources = kotlinSources()
            .filter { source -> ".entity" in source.packageName }
            .joinToString("\n") { source -> source.text }

        val tableNames = setOf(
            "app_user",
            "student_profile",
            "teacher_profile",
            "course",
            "lesson_template",
            "lesson",
            "lesson_participant",
            "assignment",
            "submission",
            "lesson_material",
            "material_asset",
            "lesson_material_annotation",
        )
        val missingTables = tableNames.filterNot { tableName ->
            entitySources.contains("""@Table(name = "$tableName")""")
        }

        assertTrue(
            missingTables.isEmpty(),
            "Every Liquibase table must have a JPA entity with explicit @Table name: $missingTables",
        )
    }

    @Test
    fun `repositories are isolated in repo package`() {
        val misplacedRepositories = kotlinSources()
            .filter { source -> source.text.contains("JpaRepository<") }
            .filterNot { source -> ".repo" in source.packageName }
            .map { source -> source.relativePath }

        assertTrue(
            misplacedRepositories.isEmpty(),
            "JpaRepository interfaces must live in com.playsay.gateway.repo: $misplacedRepositories",
        )
    }

    @Test
    fun `jdbc client is not used in production code`() {
        val springJdbcType = "Jdbc" + "Client"
        val springJdbcSqlCall = "jdbc" + "Client.sql"
        val springJdbcUsage = kotlinSources()
            .filter { source -> source.text.contains(springJdbcType) || source.text.contains(springJdbcSqlCall) }
            .map { source -> source.relativePath }

        assertTrue(
            springJdbcUsage.isEmpty(),
            "Production persistence must use Spring Data repositories instead of Spring JDBC client: $springJdbcUsage",
        )
    }

    @Test
    fun `legacy sql access is not used in production code`() {
        val legacySqlCall = "dataRepo." + "sql("
        val legacyJdbcRepo = "Legacy" + "Jdbc" + "DataRepo"
        val legacySqlUsage = kotlinSources()
            .filter { source ->
                source.text.contains(legacySqlCall) ||
                    source.text.contains(legacyJdbcRepo)
            }
            .map { source -> source.relativePath }

        assertTrue(
            legacySqlUsage.isEmpty(),
            "Legacy SQL access must not be used in production code: $legacySqlUsage",
        )
    }

    @Test
    fun `jpql queries are declared in data repo`() {
        val queryAnnotationsOutsideDataRepo = kotlinSources()
            .filter { source -> source.text.contains("@Query") }
            .filterNot { source -> source.relativePath == "repo/DataRepo.kt" }
            .map { source -> source.relativePath }

        assertTrue(
            queryAnnotationsOutsideDataRepo.isEmpty(),
            "Repository JPQL/native queries must be declared in repo/DataRepo.kt: $queryAnnotationsOutsideDataRepo",
        )
    }

    @Test
    fun `service layer does not contain raw sql statements`() {
        val rawSqlKeyword = Regex("""\b(SELECT|INSERT|UPDATE|DELETE|FROM|JOIN|WHERE)\b""")
        val serviceSqlUsage = kotlinSources()
            .filter { source -> ".service" in source.packageName }
            .filter { source -> rawSqlKeyword.containsMatchIn(source.text) }
            .map { source -> source.relativePath }

        assertTrue(
            serviceSqlUsage.isEmpty(),
            "Service layer database access must go through repository APIs: $serviceSqlUsage",
        )
    }

    @Test
    fun `shared constants are grouped in metadata`() {
        val metaDataFile = sourceRoot.resolve("utils/MetaData.kt")
        assertTrue(Files.exists(metaDataFile), "Shared constants must live in utils/MetaData.kt")

        val text = metaDataFile.readText()
        listOf("object MetaData", "object Roles", "object Authorities", "object ErrorCodes").forEach { expected ->
            assertTrue(text.contains(expected), "MetaData.kt must define $expected")
        }
    }

    @Test
    fun `role authority literals are not duplicated outside metadata`() {
        val duplicatedRoleAuthorities = kotlinSources()
            .filterNot { source -> source.relativePath == "utils/MetaData.kt" }
            .filter { source -> Regex(""""ROLE_(ADMIN|TEACHER|STUDENT)"""").containsMatchIn(source.text) }
            .map { source -> source.relativePath }

        assertTrue(
            duplicatedRoleAuthorities.isEmpty(),
            "Role authority constants must be referenced through MetaData: $duplicatedRoleAuthorities",
        )
    }

    @Test
    fun `business errors use project response exception`() {
        val directResponseStatusExceptions = kotlinSources()
            .filter { source -> ".controller" in source.packageName || ".service" in source.packageName }
            .filter { source -> source.text.contains("ResponseStatusException(") }
            .map { source -> source.relativePath }

        assertTrue(
            directResponseStatusExceptions.isEmpty(),
            "Controller/service business errors must use ProjectResponseException: $directResponseStatusExceptions",
        )
    }

    @Test
    fun `main kotlin sources do not contain direct russian text`() {
        val sourcesWithRussianText = kotlinSources()
            .filter { source -> Regex("""[А-Яа-яЁё]""").containsMatchIn(source.text) }
            .map { source -> source.relativePath }

        assertTrue(
            sourcesWithRussianText.isEmpty(),
            "Russian user-facing text must live in properties files: $sourcesWithRussianText",
        )
    }

    private fun kotlinSources(): List<KotlinSource> =
        Files.walk(sourceRoot).use { paths ->
            paths
                .filter { path -> Files.isRegularFile(path) && path.name.endsWith(".kt") }
                .map { path ->
                    val text = path.readText()
                    KotlinSource(
                        relativePath = sourceRoot.relativize(path).toString(),
                        packageName = Regex("""(?m)^package\s+([\w.]+)""")
                            .find(text)
                            ?.groupValues
                            ?.get(1)
                            .orEmpty(),
                        text = text,
                    )
                }
                .toList()
        }

    private data class KotlinSource(
        val relativePath: String,
        val packageName: String,
        val text: String,
    )
}
