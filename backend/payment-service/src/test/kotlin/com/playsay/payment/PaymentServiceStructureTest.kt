package com.playsay.payment

import com.playsay.architecture.KotlinSpringModuleArchitecture
import com.playsay.architecture.KotlinSpringModuleArchitectureConfig
import com.playsay.architecture.KotlinSpringModuleArchitectureTest

class PaymentServiceStructureTest : KotlinSpringModuleArchitectureTest() {
    override val architecture = KotlinSpringModuleArchitecture(
        KotlinSpringModuleArchitectureConfig(
            basePackage = "com.playsay.payment",
            applicationFile = "PaymentServiceApplication.kt",
            allowedTopLevelPackages = setOf("config", "controller", "dto", "service", "entity", "repo", "mapper", "utils"),
            controllerForbiddenTypes = setOf("PaymentProviderClient", "HttpClient"),
        ),
    )
}
