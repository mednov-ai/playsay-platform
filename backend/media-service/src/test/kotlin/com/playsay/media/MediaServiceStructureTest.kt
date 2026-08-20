package com.playsay.media

import com.playsay.architecture.KotlinSpringModuleArchitecture
import com.playsay.architecture.KotlinSpringModuleArchitectureConfig
import com.playsay.architecture.KotlinSpringModuleArchitectureTest

class MediaServiceStructureTest : KotlinSpringModuleArchitectureTest() {
    override val architecture = KotlinSpringModuleArchitecture(
        KotlinSpringModuleArchitectureConfig(
            basePackage = "com.playsay.media",
            applicationFile = "MediaServiceApplication.kt",
            allowedTopLevelPackages = setOf("config", "controller", "dto", "service", "entity", "repo", "mapper", "utils"),
            controllerForbiddenTypes = setOf("HttpClient"),
        ),
    )
}
