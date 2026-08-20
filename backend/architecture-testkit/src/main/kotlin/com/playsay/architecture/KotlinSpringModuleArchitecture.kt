package com.playsay.architecture

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertTrue

data class KotlinSpringModuleArchitectureConfig(
    val basePackage: String,
    val applicationFile: String,
    val allowedTopLevelPackages: Set<String>,
    val projectDirectory: Path = Path.of("").toAbsolutePath(),
    val legacyOversizedServiceFiles: Set<String> = emptySet(),
    val legacyOversizedControllerFiles: Set<String> = emptySet(),
    val allowedDtoPackageSegments: Set<String> = setOf("dto", "error"),
    val controllerForbiddenTypes: Set<String> = emptySet(),
    val maxControllerEndpoints: Int = 10,
    val maxNewServiceLines: Int = 450,
    val forbiddenPackageDependencies: Map<String, Set<String>> = defaultForbiddenPackageDependencies,
) {
    internal val sourceRoot: Path = projectDirectory
        .resolve("src/main/kotlin")
        .resolve(basePackage.replace('.', '/'))

    companion object {
        val defaultForbiddenPackageDependencies: Map<String, Set<String>> = mapOf(
            "controller" to setOf("entity", "repo"),
            "dto" to setOf("controller", "repo"),
            "entity" to setOf("controller"),
            "repo" to setOf("controller"),
        )
    }
}

class KotlinSpringModuleArchitecture(
    private val config: KotlinSpringModuleArchitectureConfig,
) {
    private val sources: List<KotlinSource> by lazy { loadSources() }

    fun assertLauncherOnlyRootPackage() {
        assertTrue(Files.isDirectory(config.sourceRoot), "Kotlin source root does not exist: ${config.sourceRoot}")
        val misplaced = directChildren()
            .filter { Files.isRegularFile(it) && it.name.endsWith(".kt") }
            .filterNot { it.name == config.applicationFile }
            .map { it.name }

        assertTrue(misplaced.isEmpty(), "Only ${config.applicationFile} may live in ${config.basePackage}: $misplaced")
    }

    fun assertIntentionalTopLevelPackages() {
        val unexpected = directChildren()
            .filter(Files::isDirectory)
            .map(Path::name)
            .filterNot(config.allowedTopLevelPackages::contains)

        assertTrue(unexpected.isEmpty(), "Unexpected top-level packages below ${config.basePackage}: $unexpected")
    }

    fun assertControllersAreThin() {
        val forbiddenTokens = commonControllerForbiddenTokens + config.controllerForbiddenTypes
        val violations = sources
            .filter { it.inPackage("controller") }
            .mapNotNull { source ->
                val matches = forbiddenTokens.filter(source.text::contains)
                if (matches.isEmpty()) null else "${source.relativePath}: $matches"
            }

        assertTrue(violations.isEmpty(), "Controllers must delegate DTO, JSON, persistence, and low-level client work: $violations")
    }

    fun assertControllersArePlacedAndFocused() {
        val misplaced = sources
            .filter { restControllerRegex.containsMatchIn(it.text) }
            .filterNot { it.inPackage("controller") }
            .map(KotlinSource::relativePath)
        val oversized = sources
            .filter { restControllerRegex.containsMatchIn(it.text) }
            .filterNot { it.relativePath in config.legacyOversizedControllerFiles }
            .mapNotNull { source ->
                val endpoints = endpointMappingRegex.findAll(source.text).count()
                if (endpoints > config.maxControllerEndpoints) "${source.relativePath}: $endpoints endpoints" else null
            }

        assertTrue(misplaced.isEmpty(), "REST controllers must live in the controller package: $misplaced")
        assertTrue(oversized.isEmpty(), "Split controllers by cohesive endpoint group: $oversized")
    }

    fun assertDtoEntityAndRepositoryPlacement() {
        val misplacedDtos = sources
            .filter { requestResponseDtoRegex.containsMatchIn(it.text) }
            .filterNot { source -> config.allowedDtoPackageSegments.any(source::inPackage) }
            .map(KotlinSource::relativePath)
        val misplacedEntities = sources
            .filter { entityRegex.containsMatchIn(it.text) }
            .filterNot { it.inPackage("entity") }
            .map(KotlinSource::relativePath)
        val misplacedRepositories = sources
            .filter { repositoryRegex.containsMatchIn(it.text) }
            .filterNot { it.inPackage("repo") }
            .map(KotlinSource::relativePath)

        assertTrue(misplacedDtos.isEmpty(), "Request/response DTOs must live in an approved DTO package: $misplacedDtos")
        assertTrue(misplacedEntities.isEmpty(), "JPA entities must live in the entity package: $misplacedEntities")
        assertTrue(misplacedRepositories.isEmpty(), "Spring Data repositories must live in the repo package: $misplacedRepositories")
    }

    fun assertPackageDependencyDirection() {
        val violations = sources.flatMap { source ->
            val sourceSegment = source.packageSegment ?: return@flatMap emptyList()
            val forbiddenTargets = config.forbiddenPackageDependencies[sourceSegment].orEmpty()
            source.importedPackageSegments
                .filter(forbiddenTargets::contains)
                .map { target -> "${source.relativePath}: $sourceSegment -> $target" }
        }

        assertTrue(violations.isEmpty(), "Package dependency direction violations: $violations")
    }

    fun assertNewServicesStayBelowThreshold() {
        val oversized = sources
            .filter { it.inPackage("service") }
            .filterNot { it.relativePath in config.legacyOversizedServiceFiles }
            .mapNotNull { source ->
                val lineCount = source.text.lineSequence().count()
                if (lineCount > config.maxNewServiceLines) "${source.relativePath}: $lineCount lines" else null
            }

        assertTrue(
            oversized.isEmpty(),
            "New service files must stay at or below ${config.maxNewServiceLines} lines: $oversized",
        )
    }

    private fun loadSources(): List<KotlinSource> {
        if (!Files.isDirectory(config.sourceRoot)) return emptyList()
        return Files.walk(config.sourceRoot).use { paths ->
            paths
                .filter { Files.isRegularFile(it) && it.name.endsWith(".kt") }
                .map { path ->
                    val text = path.readText()
                    val packageName = packageRegex.find(text)?.groupValues?.get(1).orEmpty()
                    KotlinSource(
                        relativePath = config.sourceRoot.relativize(path).toString(),
                        packageName = packageName,
                        text = text,
                        basePackage = config.basePackage,
                    )
                }
                .toList()
        }
    }

    private fun directChildren(): List<Path> =
        if (Files.isDirectory(config.sourceRoot)) Files.list(config.sourceRoot).use { it.toList() } else emptyList()

    private data class KotlinSource(
        val relativePath: String,
        val packageName: String,
        val text: String,
        val basePackage: String,
    ) {
        val packageSegment: String?
            get() = packageName.removePrefix("$basePackage.").substringBefore('.').takeIf(String::isNotBlank)

        val importedPackageSegments: Set<String>
            get() = importRegex.findAll(text)
                .map { it.groupValues[1] }
                .filter { imported -> imported.startsWith("$basePackage.") }
                .map { imported -> imported.removePrefix("$basePackage.").substringBefore('.') }
                .toSet()

        fun inPackage(segment: String): Boolean = packageName == "$basePackage.$segment" || packageName.startsWith("$basePackage.$segment.")
    }

    private companion object {
        val packageRegex = Regex("""(?m)^package\s+([\w.]+)$""")
        val importRegex = Regex("""(?m)^import\s+([\w.]+)""")
        val restControllerRegex = Regex("""(?m)^@RestController\b""")
        val endpointMappingRegex = Regex("""@(Get|Post|Put|Patch|Delete)Mapping\b""")
        val requestResponseDtoRegex = Regex("""(?m)^data\s+class\s+\w+(Request|Response)\b""")
        val entityRegex = Regex("""(?m)^@Entity\b""")
        val repositoryRegex = Regex("""\b(JpaRepository|CrudRepository)\s*<""")
        val commonControllerForbiddenTokens = setOf(
            "ObjectMapper",
            ".readTree(",
            ".writeValueAsString(",
            "JpaRepository<",
            "CrudRepository<",
            "EntityManager",
        )
    }
}

abstract class KotlinSpringModuleArchitectureTest {
    protected abstract val architecture: KotlinSpringModuleArchitecture

    @Test
    fun `root package contains only application launcher`() = architecture.assertLauncherOnlyRootPackage()

    @Test
    fun `top level package folders are intentional`() = architecture.assertIntentionalTopLevelPackages()

    @Test
    fun `rest controllers are placed and focused`() = architecture.assertControllersArePlacedAndFocused()

    @Test
    fun `controllers stay thin`() = architecture.assertControllersAreThin()

    @Test
    fun `dto entities and repositories use intentional packages`() = architecture.assertDtoEntityAndRepositoryPlacement()

    @Test
    fun `package dependencies follow the module direction`() = architecture.assertPackageDependencyDirection()

    @Test
    fun `new service files stay below cleanup threshold`() = architecture.assertNewServicesStayBelowThreshold()
}
