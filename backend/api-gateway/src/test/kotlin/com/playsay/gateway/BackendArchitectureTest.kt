package com.playsay.gateway

import com.playsay.architecture.KotlinSpringModuleArchitecture
import com.playsay.architecture.KotlinSpringModuleArchitectureConfig
import com.playsay.architecture.KotlinSpringModuleArchitectureTest
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertTrue

class BackendArchitectureTest : KotlinSpringModuleArchitectureTest() {
    private val sourceRoot: Path =
        Path.of("").toAbsolutePath().resolve("src/main/kotlin/com/playsay/gateway")

    override val architecture = KotlinSpringModuleArchitecture(
        KotlinSpringModuleArchitectureConfig(
            basePackage = "com.playsay.gateway",
            applicationFile = "ApiGatewayApplication.kt",
            allowedTopLevelPackages = setOf(
                "client",
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
            ),
            legacyOversizedServiceFiles = emptySet(),
            controllerForbiddenTypes = setOf("Repo", "Repository", "ServiceClient"),
        ),
    )

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
    fun `assignment package depends only on explicit application policies`() {
        val allowedGenericServices = setOf(
            "AssignmentAccessPolicy",
            "AssignmentProgressCalculator",
            "MaterialScoringService",
            "StudentAccessPolicy",
            "UserProfileStore",
        )
        val genericServiceImport = Regex(
            """^import com\.playsay\.gateway\.service\.([A-Za-z0-9_]+)$""",
            setOf(RegexOption.MULTILINE),
        )
        val forbiddenImports = kotlinSources()
            .filter { source -> source.packageName == "com.playsay.gateway.service.assignment" }
            .flatMap { source ->
                genericServiceImport.findAll(source.text)
                    .map { match -> match.groupValues[1] }
                    .filterNot(allowedGenericServices::contains)
                    .map { service -> "${source.relativePath}: $service" }
            }
            .toList()

        assertTrue(
            forbiddenImports.isEmpty(),
            "Assignment collaborators may depend only on explicit generic application policies: $forbiddenImports",
        )
    }

    @Test
    fun `material and schedule slices keep inward dependency direction`() {
        val materialForbidden = kotlinSources()
            .filter { it.packageName.startsWith("com.playsay.gateway.service.material") }
            .flatMap { source ->
                Regex("""^import com\.playsay\.gateway\.(controller|repo)(?:\.|$)""", RegexOption.MULTILINE)
                    .findAll(source.text)
                    .map { "${source.relativePath}: ${it.value}" }
            }
        val scheduleForbidden = kotlinSources()
            .filter { it.packageName == "com.playsay.gateway.repo.schedule" }
            .flatMap { source ->
                Regex("""^import com\.playsay\.gateway\.(controller|service)(?:\.|$)""", RegexOption.MULTILINE)
                    .findAll(source.text)
                    .map { "${source.relativePath}: ${it.value}" }
            }

        assertTrue(
            (materialForbidden + scheduleForbidden).none(),
            "Material collaborators and schedule repositories must not depend on outward layers: " +
                (materialForbidden + scheduleForbidden).toList(),
        )
    }

    @Test
    fun `worksheet import heavy implementation stays outside gateway`() {
        val forbiddenTokens = setOf(
            "org.apache.pdfbox",
            "PDFRenderer",
            "WorksheetImportSessionEntity",
            "WorksheetImportSourceEntity",
            "WorksheetImportPageEntity",
            "WorksheetAnalysisWorker",
            "WorksheetStagingObjectStorage",
        )
        val violations = kotlinSources()
            .flatMap { source ->
                forbiddenTokens.filter(source.text::contains).map { token -> "${source.relativePath}: $token" }
            }

        assertTrue(violations.isEmpty(), "PDF, session, staging and worker implementation belongs to worksheet-import-service: $violations")
        val buildFile = sourceRoot.parent.parent.parent.parent.parent.parent
            .resolve("build.gradle.kts")
            .readText()
        assertTrue(
            !buildFile.contains("project(\":worksheet-import-service\")"),
            "Gateway may depend on the worksheet internal contract, never on the service implementation.",
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
    fun `controllers do not depend on remote clients`() {
        val directClientImports = kotlinSources()
            .filter { ".controller" in it.packageName }
            .filter { Regex("""^import com\.playsay\.gateway\.client\.""", RegexOption.MULTILINE).containsMatchIn(it.text) }
            .map { it.relativePath }

        assertTrue(
            directClientImports.isEmpty(),
            "Controllers must delegate remote calls through application services: $directClientImports",
        )
    }

    @Test
    fun `controllers avoid persistence and nested domain slices stay acyclic`() {
        val forbiddenControllerImports = kotlinSources()
            .filter { ".controller" in it.packageName }
            .flatMap { source ->
                Regex("""^import com\.playsay\.gateway\.(repo|client)\.""", RegexOption.MULTILINE)
                    .findAll(source.text)
                    .map { "${source.relativePath}: ${it.value}" }
            }
            .toList()
        val domainSources = kotlinSources().filter { it.packageName.startsWith("com.playsay.gateway.service.") }
        val edges = domainSources.flatMap { source ->
            val owner = source.packageName.removePrefix("com.playsay.gateway.service.").substringBefore('.')
            Regex("""^import com\.playsay\.gateway\.service\.([a-z][A-Za-z0-9_]*)\.""", RegexOption.MULTILINE)
                .findAll(source.text)
                .map { it.groupValues[1] }
                .filter { it != owner }
                .map { target -> owner to target }
        }.toSet()
        val directCycles = edges.filter { (from, to) -> (to to from) in edges }

        assertTrue(forbiddenControllerImports.isEmpty(), "Controllers must not import repositories or clients: $forbiddenControllerImports")
        assertTrue(directCycles.isEmpty(), "Nested gateway domain slices must not form dependency cycles: $directCycles")
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
            "repo/schedule/LessonRepo.kt",
            "repo/schedule/LessonParticipantRepo.kt",
            "repo/schedule/LessonEmailReminderRepo.kt",
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
}
