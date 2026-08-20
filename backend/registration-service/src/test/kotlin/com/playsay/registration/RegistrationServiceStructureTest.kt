package com.playsay.registration

import com.playsay.architecture.KotlinSpringModuleArchitecture
import com.playsay.architecture.KotlinSpringModuleArchitectureConfig
import com.playsay.architecture.KotlinSpringModuleArchitectureTest

class RegistrationServiceStructureTest : KotlinSpringModuleArchitectureTest() {
    override val architecture = KotlinSpringModuleArchitecture(
        KotlinSpringModuleArchitectureConfig(
            basePackage = "com.playsay.registration",
            applicationFile = "RegistrationServiceApplication.kt",
            allowedTopLevelPackages = setOf("client", "config", "controller", "dto", "entity", "repo", "service", "utils"),
            controllerForbiddenTypes = setOf("HttpClient"),
        ),
    )
}
