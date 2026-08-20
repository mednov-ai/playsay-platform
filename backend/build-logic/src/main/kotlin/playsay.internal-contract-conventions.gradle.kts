import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.KotlinModule
import java.net.URLClassLoader
import java.util.Properties
import org.gradle.api.GradleException
import org.openapitools.generator.gradle.plugin.tasks.GenerateTask
import org.openapitools.generator.gradle.plugin.tasks.ValidateTask

plugins {
    id("playsay.kotlin-conventions")
    id("java-library")
    id("org.openapi.generator")
}

val contractDomain = project.name.removeSuffix("-internal-contract")
val contractSpec = layout.projectDirectory.file("src/main/openapi/openapi.yaml")
val generatedRoot = layout.buildDirectory.dir("generated/openapi")
val generatedModelPackage = "com.playsay.contract.${contractDomain.replace("-", "")}.model"

dependencies {
    "api"("com.fasterxml.jackson.core:jackson-annotations:2.20")
    "api"("jakarta.validation:jakarta.validation-api:3.1.1")
}

tasks.named<GenerateTask>("openApiGenerate") {
    group = "contract generation"
    description = "Generates framework-neutral $contractDomain internal contract models."
    generatorName.set("kotlin")
    library.set("jvm-retrofit2")
    inputSpec.set(contractSpec.asFile.absolutePath)
    outputDir.set(generatedRoot.get().asFile.absolutePath)
    cleanupOutput.set(true)
    modelPackage.set(generatedModelPackage)
    typeMappings.set(mapOf("DateTime" to "Instant"))
    importMappings.set(mapOf("Instant" to "java.time.Instant"))
    nameMappings.set(mapOf("size" to "size"))
    globalProperties.set(
        mapOf(
            "models" to "",
            "apis" to "false",
            "supportingFiles" to "false",
            "modelDocs" to "false",
            "modelTests" to "false",
        ),
    )
    configOptions.set(
        mapOf(
            "dateLibrary" to "java8",
            "enumPropertyNaming" to "original",
            "serializationLibrary" to "jackson",
            "sourceFolder" to "src/main/kotlin",
            "useBeanValidation" to "false",
        ),
    )
    onlyIf("the service-owned internal OpenAPI document exists") { contractSpec.asFile.isFile }
}

tasks.named<ValidateTask>("openApiValidate") {
    inputSpec.set(contractSpec.asFile.absolutePath)
    recommend.set(true)
    onlyIf("the service-owned internal OpenAPI document exists") { contractSpec.asFile.isFile }
}

sourceSets {
    named("main") {
        kotlin.srcDir(generatedRoot.map { it.dir("src/main/kotlin") })
    }
}

val verifyNoCheckedInGeneratedContractSources = tasks.register("verifyNoCheckedInGeneratedContractSources") {
    group = "verification"
    description = "Rejects hand-written or checked-in Kotlin sources in generated contract modules."
    val checkedInKotlin = layout.projectDirectory.dir("src/main/kotlin")
    inputs.files(checkedInKotlin.asFileTree.matching { include("**/*.kt") })
    doLast {
        val sources = checkedInKotlin.asFileTree.matching { include("**/*.kt") }.files
        if (sources.isNotEmpty()) {
            throw GradleException(
                "Internal contract Kotlin is generated under build/. Remove checked-in sources: " +
                    sources.sorted().joinToString { it.relativeTo(project.projectDir).path },
            )
        }
    }
}

val verifyInternalContractFixtures = tasks.register("verifyInternalContractFixtures") {
    group = "contract verification"
    description = "Verifies provider and consumer JSON fixtures remain byte-equivalent."
    val providerFixtures = layout.projectDirectory.dir("src/test/fixtures/provider")
    val consumerFixtures = layout.projectDirectory.dir("src/test/fixtures/consumer")
    inputs.files(providerFixtures.asFileTree.matching { include("**/*.json") })
    inputs.files(consumerFixtures.asFileTree.matching { include("**/*.json") })
    onlyIf("the service-owned internal OpenAPI document exists") { contractSpec.asFile.isFile }
    doLast {
        if (!providerFixtures.asFile.isDirectory || !consumerFixtures.asFile.isDirectory) {
            throw GradleException(
                "Internal contracts require provider and consumer fixtures below src/test/fixtures.",
            )
        }
        fun relativeJsonFiles(root: java.io.File): Map<String, java.io.File> = root.walkTopDown()
            .filter { file -> file.isFile && file.extension == "json" }
            .associateBy { file -> file.relativeTo(root).invariantSeparatorsPath }

        val provider = relativeJsonFiles(providerFixtures.asFile)
        val consumer = relativeJsonFiles(consumerFixtures.asFile)
        if (provider.isEmpty()) {
            throw GradleException("Internal contract fixtures must contain at least one JSON document.")
        }
        val missingFromConsumer = provider.keys - consumer.keys
        val missingFromProvider = consumer.keys - provider.keys
        val mismatched = (provider.keys intersect consumer.keys).filter { relativePath ->
            !provider.getValue(relativePath).readBytes().contentEquals(consumer.getValue(relativePath).readBytes())
        }
        if (missingFromConsumer.isNotEmpty() || missingFromProvider.isNotEmpty() || mismatched.isNotEmpty()) {
            throw GradleException(
                "Provider/consumer fixtures drifted: " +
                    "missing consumer=$missingFromConsumer, missing provider=$missingFromProvider, mismatched=$mismatched",
            )
        }
    }
}

val verifyInternalContractFixtureModels = tasks.register("verifyInternalContractFixtureModels") {
    group = "contract verification"
    description = "Verifies every JSON fixture against its generated service-owned contract model."
    dependsOn(tasks.named("classes"))
    dependsOn(verifyInternalContractFixtures)
    val fixtureRoot = layout.projectDirectory.dir("src/test/fixtures")
    val modelMappings = fixtureRoot.file("models.properties")
    val providerFixtures = fixtureRoot.dir("provider")
    val consumerFixtures = fixtureRoot.dir("consumer")
    inputs.file(modelMappings)
    inputs.files(providerFixtures.asFileTree.matching { include("**/*.json") })
    inputs.files(consumerFixtures.asFileTree.matching { include("**/*.json") })
    onlyIf("the service-owned internal OpenAPI document exists") { contractSpec.asFile.isFile }
    doLast {
        if (!modelMappings.asFile.isFile) {
            throw GradleException("Internal contract fixtures require src/test/fixtures/models.properties.")
        }
        val mappings = Properties().apply {
            modelMappings.asFile.inputStream().use { stream -> load(stream) }
        }
        val mappedPaths = mappings.stringPropertyNames()
        fun relativeJsonPaths(root: java.io.File): Set<String> = root.walkTopDown()
            .filter { file -> file.isFile && file.extension == "json" }
            .map { file -> file.relativeTo(root).invariantSeparatorsPath }
            .toSet()

        val fixturePaths = relativeJsonPaths(providerFixtures.asFile)
        if (mappedPaths != fixturePaths) {
            throw GradleException(
                "Fixture model manifest drifted: missing mappings=${fixturePaths - mappedPaths}, " +
                    "stale mappings=${mappedPaths - fixturePaths}",
            )
        }
        val runtimeUrls = sourceSets.named("main").get().runtimeClasspath.files
            .map { file -> file.toURI().toURL() }
            .toTypedArray()
        URLClassLoader(runtimeUrls, ObjectMapper::class.java.classLoader).use { modelLoader ->
            val mapper = ObjectMapper()
                .registerModule(KotlinModule.Builder().build())
                .registerModule(JavaTimeModule())
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            lateinit var canonicalJson: (JsonNode) -> String
            canonicalJson = { node ->
                when {
                    node.isObject -> node.properties().asSequence()
                        .sortedBy { entry -> entry.key }
                        .joinToString(prefix = "{", postfix = "}") { entry ->
                            "${mapper.writeValueAsString(entry.key)}:${canonicalJson(entry.value)}"
                        }
                    node.isArray -> node.elements().asSequence()
                        .joinToString(prefix = "[", postfix = "]") { element -> canonicalJson(element) }
                    node.isNumber -> node.decimalValue().stripTrailingZeros().toPlainString()
                    else -> mapper.writeValueAsString(node)
                }
            }
            listOf(providerFixtures.asFile, consumerFixtures.asFile).forEach { root ->
                mappedPaths.sorted().forEach { relativePath ->
                    val simpleModelName = mappings.getProperty(relativePath).trim()
                    if (!simpleModelName.matches(Regex("[A-Za-z][A-Za-z0-9]*"))) {
                        throw GradleException("Invalid generated model name '$simpleModelName' for $relativePath.")
                    }
                    val fixture = root.resolve(relativePath)
                    val modelClass = Class.forName("$generatedModelPackage.$simpleModelName", true, modelLoader)
                    val sourceTree = mapper.readTree(fixture)
                    val model = mapper.treeToValue(sourceTree, modelClass)
                    val roundTripTree = mapper.valueToTree<JsonNode>(model)
                    val sourceJson = canonicalJson(sourceTree)
                    val roundTripJson = canonicalJson(roundTripTree)
                    if (sourceJson != roundTripJson) {
                        throw GradleException(
                            "Fixture $relativePath does not round-trip through $simpleModelName; " +
                                "source=$sourceTree generated=$roundTripTree",
                        )
                    }
                }
            }
        }
    }
}

tasks.named("compileKotlin") {
    dependsOn(tasks.named("openApiGenerate"))
}

tasks.named("check") {
    dependsOn(verifyNoCheckedInGeneratedContractSources)
    dependsOn(verifyInternalContractFixtureModels)
}
