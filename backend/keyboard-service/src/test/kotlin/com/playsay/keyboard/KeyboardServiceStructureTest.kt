package com.playsay.keyboard

import com.playsay.architecture.KotlinSpringModuleArchitecture
import com.playsay.architecture.KotlinSpringModuleArchitectureConfig
import com.playsay.architecture.KotlinSpringModuleArchitectureTest
import java.nio.file.Path
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertTrue

class KeyboardServiceStructureTest : KotlinSpringModuleArchitectureTest() {
    private val sourceRoot = Path.of("").toAbsolutePath().resolve("src/main/kotlin/com/playsay/keyboard")

    override val architecture = KotlinSpringModuleArchitecture(
        KotlinSpringModuleArchitectureConfig(
            basePackage = "com.playsay.keyboard",
            applicationFile = "KeyboardServiceApplication.kt",
            allowedTopLevelPackages = setOf("config", "controller", "dto", "service", "entity", "repo", "mapper", "utils"),
        ),
    )

    @Test
    fun `anonymous keyboard endpoints are explicitly public`() {
        val securityConfig = sourceRoot.resolve("config/SecurityConfig.kt").readText()

        assertTrue(
            securityConfig.contains("\"/api/anonymous/**\""),
            "SecurityConfig must keep anonymous keyboard ingestion public while protected progress APIs stay authenticated.",
        )
    }
}
