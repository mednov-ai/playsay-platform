plugins {
    `kotlin-dsl`
}

dependencies {
    implementation("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.21")
    implementation("org.jetbrains.kotlin:kotlin-allopen:2.2.21")
    implementation("org.jetbrains.kotlin:kotlin-noarg:2.2.21")
    implementation("org.springframework.boot:spring-boot-gradle-plugin:4.0.2")
    implementation("io.spring.gradle:dependency-management-plugin:1.1.7")
    implementation("dev.detekt:detekt-gradle-plugin:2.0.0-alpha.1")
    implementation("org.openapitools:openapi-generator-gradle-plugin:7.24.0")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.20.0")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.20.0")
}
