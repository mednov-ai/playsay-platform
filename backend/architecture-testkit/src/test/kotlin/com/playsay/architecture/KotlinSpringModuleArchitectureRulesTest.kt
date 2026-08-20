package com.playsay.architecture

import java.nio.file.Path
import kotlin.io.path.createDirectories
import kotlin.io.path.createTempDirectory
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertFailsWith

class KotlinSpringModuleArchitectureRulesTest {
    @Test
    fun `accepts a module that follows all shared rules`() = withFixture { projectDirectory ->
        source(projectDirectory, "SampleApplication.kt", "package com.example.sample\nclass SampleApplication")
        source(projectDirectory, "controller/SampleController.kt", "package com.example.sample.controller\n@RestController\nclass SampleController")
        source(projectDirectory, "dto/SampleResponse.kt", "package com.example.sample.dto\ndata class SampleResponse(val value: String)")
        source(projectDirectory, "entity/SampleEntity.kt", "package com.example.sample.entity\n@Entity\nclass SampleEntity")
        source(projectDirectory, "repo/SampleRepo.kt", "package com.example.sample.repo\ninterface SampleRepo : JpaRepository<SampleEntity, Long>")
        source(projectDirectory, "service/SampleService.kt", "package com.example.sample.service\nclass SampleService")

        val architecture = architecture(projectDirectory)

        architecture.assertLauncherOnlyRootPackage()
        architecture.assertIntentionalTopLevelPackages()
        architecture.assertControllersArePlacedAndFocused()
        architecture.assertControllersAreThin()
        architecture.assertDtoEntityAndRepositoryPlacement()
        architecture.assertPackageDependencyDirection()
        architecture.assertNewServicesStayBelowThreshold()
    }

    @Test
    fun `reports placement dependency controller and size violations`() = withFixture { projectDirectory ->
        source(projectDirectory, "SampleApplication.kt", "package com.example.sample\nclass SampleApplication")
        source(projectDirectory, "Wrong.kt", "package com.example.sample\ndata class WrongResponse(val value: String)")
        source(
            projectDirectory,
            "controller/WrongController.kt",
            "package com.example.sample.controller\nimport com.example.sample.repo.SampleRepo\n@RestController\nclass WrongController(private val mapper: ObjectMapper)",
        )
        source(projectDirectory, "service/HugeService.kt", List(451) { "// line $it" }.joinToString("\n", prefix = "package com.example.sample.service\n"))

        val architecture = architecture(projectDirectory)

        assertFailsWith<AssertionError> { architecture.assertLauncherOnlyRootPackage() }
        assertFailsWith<AssertionError> { architecture.assertControllersAreThin() }
        assertFailsWith<AssertionError> { architecture.assertDtoEntityAndRepositoryPlacement() }
        assertFailsWith<AssertionError> { architecture.assertPackageDependencyDirection() }
        assertFailsWith<AssertionError> { architecture.assertNewServicesStayBelowThreshold() }
    }

    private fun architecture(projectDirectory: Path) = KotlinSpringModuleArchitecture(
        KotlinSpringModuleArchitectureConfig(
            basePackage = "com.example.sample",
            applicationFile = "SampleApplication.kt",
            allowedTopLevelPackages = setOf("controller", "dto", "entity", "repo", "service"),
            projectDirectory = projectDirectory,
        ),
    )

    private fun source(projectDirectory: Path, relativePath: String, text: String) {
        projectDirectory
            .resolve("src/main/kotlin/com/example/sample")
            .resolve(relativePath)
            .also { it.parent.createDirectories() }
            .writeText(text)
    }

    private fun withFixture(test: (Path) -> Unit) {
        val directory = createTempDirectory("architecture-testkit-")
        try {
            test(directory)
        } finally {
            directory.toFile().deleteRecursively()
        }
    }
}
