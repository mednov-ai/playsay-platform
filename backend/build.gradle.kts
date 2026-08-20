subprojects {
    group = "com.playsay"
    version = "0.1.0-SNAPSHOT"
}

val internalContractProjects = listOf(
    ":contracts:registration-internal-contract",
    ":contracts:payment-internal-contract",
    ":contracts:email-internal-contract",
    ":contracts:media-internal-contract",
)

tasks.register("validateInternalContracts") {
    group = "contract verification"
    description = "Validates every service-owned internal OpenAPI document."
    dependsOn(internalContractProjects.map { "$it:openApiValidate" })
}

tasks.register("regenerateInternalContractModels") {
    group = "contract generation"
    description = "Regenerates all internal Kotlin contract models under module build directories."
    dependsOn(internalContractProjects.map { "$it:openApiGenerate" })
}

tasks.register("verifyInternalContracts") {
    group = "contract verification"
    description = "Validates internal schemas, fixtures, generated models, and generated-source ownership."
    dependsOn("validateInternalContracts", "regenerateInternalContractModels")
    dependsOn(internalContractProjects.map { "$it:verifyInternalContractFixtureModels" })
    dependsOn(internalContractProjects.map { "$it:verifyNoCheckedInGeneratedContractSources" })
}
