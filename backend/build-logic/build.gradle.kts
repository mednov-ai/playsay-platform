plugins {
    `kotlin-dsl`
}

dependencies {
    implementation("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.20")
    implementation("org.jetbrains.kotlin:kotlin-allopen:2.4.20")
    implementation("org.jetbrains.kotlin:kotlin-noarg:2.4.20")
    implementation("org.springframework.boot:spring-boot-gradle-plugin:4.0.8")
    implementation("io.spring.gradle:dependency-management-plugin:1.1.7")
    implementation("dev.detekt:detekt-gradle-plugin:2.0.0-alpha.1")
    implementation("org.openapitools:openapi-generator-gradle-plugin:7.24.0")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.21.5")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.21.5")
    constraints {
        implementation("com.github.jknack:handlebars:4.5.4") {
            because("Replace shaded vulnerable Commons Lang 3.12.0 in OpenAPI build tooling")
        }
        implementation("com.fasterxml.jackson.core:jackson-databind:2.22.2") {
            because("CVE-2026-54515: fixed 2.22 maintenance version for build tooling")
        }
        implementation("org.apache.commons:commons-lang3:3.20.0") {
            because("CVE-2025-48924: use the fixed maintenance version in build tooling")
        }
        implementation("org.apache.httpcomponents.client5:httpclient5:5.6.4") {
            because("CVE-2026-64607 and CVE-2026-71290")
        }
        implementation("org.apache.httpcomponents.core5:httpcore5:5.4.3") {
            because("CVE-2026-54399 and CVE-2026-54428")
        }
        implementation("org.apache.httpcomponents.core5:httpcore5-h2:5.4.3") {
            because("Keep HttpComponents core modules aligned")
        }
    }
}
