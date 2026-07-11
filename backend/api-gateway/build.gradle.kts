plugins {
    kotlin("jvm")
    kotlin("plugin.jpa")
    kotlin("plugin.spring")
    id("org.springframework.boot")
    id("io.spring.dependency-management")
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    implementation(project(":shared-kotlin"))
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-jackson")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("com.networknt:json-schema-validator:1.5.9")
    implementation("com.nimbusds:nimbus-jose-jwt")
    implementation("org.liquibase:liquibase-core")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:3.0.3")
    implementation(platform("software.amazon.awssdk:bom:2.44.12"))
    implementation("software.amazon.awssdk:s3")
    runtimeOnly("org.postgresql:postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("com.h2database:h2")
}

tasks.withType<Test> {
    useJUnitPlatform()
    if (providers.gradleProperty("lowMemoryTests").isPresent) {
        maxParallelForks = 1
        forkEvery = 8
        maxHeapSize = "512m"
    }
}

tasks.named("jar") {
    enabled = false
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
