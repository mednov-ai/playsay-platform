package com.playsay.vocabulary

import com.playsay.architecture.KotlinSpringModuleArchitecture
import com.playsay.architecture.KotlinSpringModuleArchitectureConfig
import com.playsay.architecture.KotlinSpringModuleArchitectureTest

class VocabularyServiceStructureTest : KotlinSpringModuleArchitectureTest() {
    override val architecture = KotlinSpringModuleArchitecture(
        KotlinSpringModuleArchitectureConfig(
            basePackage = "com.playsay.vocabulary",
            applicationFile = "VocabularyServiceApplication.kt",
            allowedTopLevelPackages = setOf(
                "config",
                "controller",
                "dto",
                "entity",
                "mapper",
                "realtime",
                "repo",
                "service",
                "util",
            ),
            legacyOversizedControllerFiles = setOf("controller/VocabularyPracticeController.kt"),
        ),
    )
}
