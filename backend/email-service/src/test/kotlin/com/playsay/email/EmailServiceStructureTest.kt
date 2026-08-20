package com.playsay.email

import com.playsay.architecture.KotlinSpringModuleArchitecture
import com.playsay.architecture.KotlinSpringModuleArchitectureConfig
import com.playsay.architecture.KotlinSpringModuleArchitectureTest

class EmailServiceStructureTest : KotlinSpringModuleArchitectureTest() {
    override val architecture = KotlinSpringModuleArchitecture(
        KotlinSpringModuleArchitectureConfig(
            basePackage = "com.playsay.email",
            applicationFile = "EmailServiceApplication.kt",
            allowedTopLevelPackages = setOf("config", "controller", "dto", "service", "entity", "repo", "mapper", "utils"),
            controllerForbiddenTypes = setOf("JavaMailSender"),
        ),
    )
}
