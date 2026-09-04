plugins {
    id("playsay.jpa-service-conventions")
}

dependencies {
    implementation(project(":integration-support"))
    implementation(project(":openai-support"))
    implementation(project(":contracts:email-internal-contract"))
    implementation(project(":contracts:media-internal-contract"))
    implementation(project(":contracts:registration-internal-contract"))
    implementation(project(":contracts:payment-internal-contract"))
    implementation(project(":contracts:worksheet-import-internal-contract"))
    testImplementation(project(":architecture-testkit"))
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-jackson")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("com.networknt:json-schema-validator:1.5.9")
    implementation("com.nimbusds:nimbus-jose-jwt")
    implementation("nl.martijndwars:web-push:5.1.2")
    implementation("org.apache.httpcomponents:httpasyncclient:4.1.5")
    implementation("org.asynchttpclient:async-http-client:2.12.4")
    implementation("org.bouncycastle:bcprov-jdk18on:1.85.2")
    implementation("org.bitbucket.b_c:jose4j:0.7.9")
    implementation("org.jsoup:jsoup:1.18.3")
    implementation("org.springframework.boot:spring-boot-starter-liquibase")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:3.0.3")
    implementation(platform("software.amazon.awssdk:bom:2.44.12"))
    implementation("software.amazon.awssdk:s3")
    runtimeOnly("org.postgresql:postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("com.h2database:h2")
}

tasks.withType<Test> {
    inputs.property("regionalRoutingHelmMatrix", providers.environmentVariable("REGIONAL_ROUTING_HELM_MATRIX").orElse(""))
    if (providers.gradleProperty("lowMemoryTests").isPresent) {
        maxParallelForks = 1
        forkEvery = 8
        maxHeapSize = "512m"
    }
}

tasks.register<Test>("exportOpenApi") {
    group = "documentation"
    description = "Exports the api-gateway OpenAPI contract to contracts/openapi.yaml."
    useJUnitPlatform()
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    filter {
        includeTestsMatching("com.playsay.gateway.OpenApiExportTest")
    }
    systemProperty("playsay.openapi.export", "true")
    systemProperty(
        "playsay.openapi.output",
        rootProject.layout.projectDirectory.file("../contracts/openapi.yaml").asFile.absolutePath,
    )
}

val verifyWorksheetImportGeneratedClient = tasks.register<Exec>("verifyWorksheetImportGeneratedClient") {
    group = "contract verification"
    description = "Verifies the checked-in worksheet-import gateway client matches the internal OpenAPI contract."
    workingDir(rootProject.layout.projectDirectory.dir(".."))
    commandLine("node", "scripts/contracts/generate-worksheet-import-client.mjs", "--check")
}

tasks.named("check") {
    dependsOn(verifyWorksheetImportGeneratedClient)
}
