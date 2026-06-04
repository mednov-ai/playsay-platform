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
    fun `root package contains only application launcher`() {
        val misplacedRootFiles = sourceRoot.listEntries()
            .filter { path -> Files.isRegularFile(path) && path.name.endsWith(".kt") }
            .filterNot { path -> path.name == "ApiGatewayApplication.kt" }
            .map { path -> path.name }

        assertTrue(
            misplacedRootFiles.isEmpty(),
            "Root package must contain only ApiGatewayApplication.kt: $misplacedRootFiles",
        )
    }

    @Test
    fun `top level package folders are intentional`() {
        val intentionalFolders = setOf(
            "config",
            "controller",
            "dto",
            "entity",
            "error",
            "mapper",
            "realtime",
            "repo",
            "service",
            "utils",
        )
        val unexpectedFolders = sourceRoot.listEntries()
            .filter { path -> Files.isDirectory(path) }
            .map { path -> path.name }
            .filterNot { name -> name in intentionalFolders }

        assertTrue(
            unexpectedFolders.isEmpty(),
            "Top-level package folders must be intentional and reviewed: $unexpectedFolders",
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
            "REST controllers must live in com.playsay.gateway.controller: $misplacedControllers",
        )
    }

    @Test
    fun `rest controllers stay focused by endpoint group`() {
        val mappingAnnotation = Regex("""@(Get|Post|Put|Patch|Delete)Mapping\b""")
        val oversizedControllers = kotlinSources()
            .filter { source -> Regex("""(?m)^@RestController$""").containsMatchIn(source.text) }
            .mapNotNull { source ->
                val endpointCount = mappingAnnotation.findAll(source.text).count()
                if (endpointCount > 10) "${source.relativePath} has $endpointCount endpoints" else null
            }

        assertTrue(
            oversizedControllers.isEmpty(),
            "Split REST controllers by cohesive endpoint groups: $oversizedControllers",
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
    fun `backend kotlin files stay below tactical extraction threshold`() {
        val oversizedFiles = kotlinSources()
            .mapNotNull { source ->
                val lineCount = source.text.lineSequence().count()
                if (lineCount > 1_500) "${source.relativePath} has $lineCount lines" else null
            }

        assertTrue(
            oversizedFiles.isEmpty(),
            "Split large backend files into cohesive collaborators before they become unreviewable: $oversizedFiles",
        )
    }

    @Test
    fun `new service files stay below cleanup threshold`() {
        val legacyOversizedServices = setOf(
            "service/AssignmentStore.kt",
            "service/LessonMaterialStore.kt",
            "service/MaterialAiDraftService.kt",
            "service/MaterialScoringService.kt",
        )
        val oversizedServices = kotlinSources()
            .filter { source -> ".service" in source.packageName }
            .filterNot { source -> source.relativePath in legacyOversizedServices }
            .mapNotNull { source ->
                val lineCount = source.text.lineSequence().count()
                if (lineCount > 450) "${source.relativePath} has $lineCount lines" else null
            }

        assertTrue(
            oversizedServices.isEmpty(),
            "New services should be split before crossing 450 lines: $oversizedServices",
        )
    }

    @Test
    fun `controllers do not parse or serialize json directly`() {
        val controllerJsonUsage = kotlinSources()
            .filter { source -> ".controller" in source.packageName }
            .filter { source ->
                source.text.contains("ObjectMapper") ||
                    source.text.contains(".readTree(") ||
                    source.text.contains(".writeValueAsString(")
            }
            .map { source -> source.relativePath }

        assertTrue(
            controllerJsonUsage.isEmpty(),
            "Controllers must delegate JSON parsing and serialization to services or codecs: $controllerJsonUsage",
        )
    }

    @Test
    fun `controllers do not inject persistence or internal provider clients`() {
        val entityReference = Regex("""com\.playsay\.gateway\.entity\.|\b[A-Z]\w*Entity\b""")
        val controllerLowLevelDependencies = kotlinSources()
            .filter { source -> ".controller" in source.packageName }
            .filter { source ->
                source.text.contains("Repo") ||
                    source.text.contains("Repository") ||
                    entityReference.containsMatchIn(source.text.replace("ResponseEntity", "")) ||
                    source.text.contains("ServiceClient")
            }
            .map { source -> source.relativePath }

        assertTrue(
            controllerLowLevelDependencies.isEmpty(),
            "Controllers must depend on application services/stores, not persistence or internal provider clients: $controllerLowLevelDependencies",
        )
    }

    @Test
    fun `controllers delegate business authorization failures to services`() {
        val controllerBusinessErrors = kotlinSources()
            .filter { source -> ".controller" in source.packageName }
            .filter { source -> source.text.contains("ProjectResponseException") }
            .map { source -> source.relativePath }

        assertTrue(
            controllerBusinessErrors.isEmpty(),
            "Controllers must delegate business authorization and error decisions to services: $controllerBusinessErrors",
        )
    }

    @Test
    fun `mapper classes live in mapper package`() {
        val misplacedMappers = kotlinSources()
            .filter { source -> Regex("""\bclass\s+\w+Mapper\b""").containsMatchIn(source.text) }
            .filterNot { source -> ".mapper" in source.packageName }
            .map { source -> source.relativePath }

        assertTrue(
            misplacedMappers.isEmpty(),
            "Mapper classes must live in com.playsay.gateway.mapper: $misplacedMappers",
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
    fun `repository contracts are split by aggregate`() {
        val expectedRepoFiles = setOf(
            "repo/UserRepos.kt",
            "repo/CourseRepos.kt",
            "repo/ScheduleRepos.kt",
            "repo/MaterialRepos.kt",
            "repo/AssignmentRepos.kt",
            "repo/CollaborationRepos.kt",
        )
        val existingRepoFiles = kotlinSources()
            .filter { source -> ".repo" in source.packageName }
            .filter { source -> source.text.contains("JpaRepository<") }
            .map { source -> source.relativePath }
            .toSet()

        val missingRepoFiles = expectedRepoFiles - existingRepoFiles

        assertTrue(
            missingRepoFiles.isEmpty(),
            "Split repository contracts by aggregate instead of growing repo/DataRepo.kt: $missingRepoFiles",
        )
    }

    @Test
    fun `repository jpql queries stay in repo package`() {
        val queryAnnotationsOutsideRepo = kotlinSources()
            .filter { source -> source.text.contains("@Query") }
            .filterNot { source -> ".repo" in source.packageName }
            .map { source -> source.relativePath }

        assertTrue(
            queryAnnotationsOutsideRepo.isEmpty(),
            "Repository JPQL queries must stay in com.playsay.gateway.repo: $queryAnnotationsOutsideRepo",
        )
    }

    @Test
    fun `repository queries are jpql not native sql`() {
        val nativeQueries = kotlinSources()
            .filter { source -> ".repo" in source.packageName }
            .filter { source -> Regex("""@Query\s*\([^)]*nativeQuery\s*=\s*true""", RegexOption.DOT_MATCHES_ALL).containsMatchIn(source.text) }
            .map { source -> source.relativePath }

        assertTrue(
            nativeQueries.isEmpty(),
            "Repository queries must use JPQL unless a migration-specific allowlist is added: $nativeQueries",
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
    fun `material store business errors use localized project error codes`() {
        val materialStore = sourceRoot.resolve("service/LessonMaterialStore.kt").readText()
        val rawMaterialErrors = Regex("""ProjectResponseException\(HttpStatus\.[A-Z_]+,\s*"""")
            .findAll(materialStore)
            .map { match -> match.value }
            .toList()

        assertTrue(
            rawMaterialErrors.isEmpty(),
            "LessonMaterialStore business errors must use ProjectResponseException.localized and MetaData error codes.",
        )
    }

    @Test
    fun `controller and service business errors use localized project error codes`() {
        val rawBusinessErrors = kotlinSources()
            .filter { source -> ".controller" in source.packageName || ".service" in source.packageName }
            .flatMap { source ->
                Regex("""ProjectResponseException\(HttpStatus\.[A-Z_]+,\s*"""")
                    .findAll(source.text)
                    .map { "${source.relativePath}: ${it.value}" }
            }
            .toList()

        assertTrue(
            rawBusinessErrors.isEmpty(),
            "Controller/service ProjectResponseException calls must use localized MetaData error codes: $rawBusinessErrors",
        )
    }

    @Test
    fun `material store does not own answer suggestion context parsing`() {
        val materialStore = sourceRoot.resolve("service/LessonMaterialStore.kt").readText()
        val ownsAnswerContextParsing = Regex("""\b(fun\s+materialAnswerItemContexts|data\s+class\s+MaterialAnswerItemContext)\b""")
            .containsMatchIn(materialStore)

        assertTrue(
            !ownsAnswerContextParsing,
            "Move material answer suggestion context parsing into a dedicated service helper.",
        )
    }

    @Test
    fun `material store does not own generated image target discovery`() {
        val materialStore = sourceRoot.resolve("service/LessonMaterialStore.kt").readText()
        val ownsImageTargetDiscovery = Regex("""\b(fun\s+materialImageTargets|fun\s+materialImageTargetDecision|data\s+class\s+MaterialImageTarget)\b""")
            .containsMatchIn(materialStore)

        assertTrue(
            !ownsImageTargetDiscovery,
            "Move material generated-image target discovery into a dedicated service helper.",
        )
    }

    @Test
    fun `material store does not own material asset persistence details`() {
        val materialStore = sourceRoot.resolve("service/LessonMaterialStore.kt").readText()
        val ownsMaterialAssetPersistence = Regex(
            """\b(fun\s+upsertGeneratedImageAsset|fun\s+insertGeneratedImageAsset|fun\s+replaceGeneratedImageAsset|fun\s+generatedImageMetadata|fun\s+generatedImageTags|fun\s+materialAssetTags|fun\s+normalizeMaterialImageTags|fun\s+cleanupReplacedGeneratedAssets|fun\s+findAsset|fun\s+findAssets)\b""",
        ).containsMatchIn(materialStore)

        assertTrue(
            !ownsMaterialAssetPersistence,
            "Move material asset persistence, metadata, and generated-image storage details into a dedicated service.",
        )
    }

    @Test
    fun `material store does not own material submission persistence details`() {
        val materialStore = sourceRoot.resolve("service/LessonMaterialStore.kt").readText()
        val ownsMaterialSubmissionPersistence = Regex(
            """\b(fun\s+findOrCreateMaterialSubmissionAssignment|fun\s+createEmptyMaterialSubmission|fun\s+emptyMaterialSubmissionContent|fun\s+findMaterialSubmissionAssignment|fun\s+findMaterialSubmission)\b""",
        ).containsMatchIn(materialStore)

        assertTrue(
            !ownsMaterialSubmissionPersistence,
            "Move material submission assignment, scoring, and persistence details into a dedicated service.",
        )
    }

    @Test
    fun `material store does not own material annotation persistence details`() {
        val materialStore = sourceRoot.resolve("service/LessonMaterialStore.kt").readText()
        val ownsMaterialAnnotationPersistence = Regex(
            """\b(fun\s+createEmptyMaterialAnnotation|fun\s+emptyMaterialAnnotationContent|fun\s+findMaterialAnnotation)\b""",
        ).containsMatchIn(materialStore)

        assertTrue(
            !ownsMaterialAnnotationPersistence,
            "Move material annotation JSON and persistence details into a dedicated service.",
        )
    }

    @Test
    fun `material store does not own material catalog persistence details`() {
        val materialStore = sourceRoot.resolve("service/LessonMaterialStore.kt").readText()
        val ownsMaterialCatalogPersistence = Regex(
            """\b(LessonMaterialEntity|LessonMaterialRepo|writeValueAsString|findRowsForAdmin|findRowsForTeacher|findPublicPublishedRows|findRowById)\b""",
        ).containsMatchIn(materialStore)

        assertTrue(
            !ownsMaterialCatalogPersistence,
            "Move material CRUD, visibility listing, and row mapping details into a dedicated catalog service.",
        )
    }

    @Test
    fun `material store does not own material authoring orchestration details`() {
        val materialStore = sourceRoot.resolve("service/LessonMaterialStore.kt").readText()
        val ownsMaterialAuthoringOrchestration = Regex(
            """\b(MaterialAiDraftInput|MaterialImageGenerationInput|MaterialAnswerSuggestionInput|materialImageTargets|materialAnswerItemContexts|findMaterialBlock)\b""",
        ).containsMatchIn(materialStore)

        assertTrue(
            !ownsMaterialAuthoringOrchestration,
            "Move AI draft, URL import, image generation, and answer suggestion orchestration into a dedicated authoring service.",
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

    private fun Path.listEntries(): List<Path> {
        val stream = Files.list(this)
        return try {
            stream.toList()
        } finally {
            stream.close()
        }
    }
}
