plugins {
    `java-library`
}

group = "com.playsay.keycloak"
version = "1.0.0"

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(21))
}

dependencies {
    // Match the dependency management of the pinned Keycloak server image.
    compileOnly(platform("org.keycloak:keycloak-parent:26.7.3"))
    testImplementation(platform("org.keycloak:keycloak-parent:26.7.3"))
    compileOnly("org.keycloak:keycloak-server-spi:26.7.3")
    compileOnly("org.keycloak:keycloak-server-spi-private:26.7.3")
    compileOnly("org.keycloak:keycloak-services:26.7.3")
    compileOnly("com.fasterxml.jackson.core:jackson-databind")

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.11.4")
    testImplementation("org.mockito:mockito-core:5.15.2")
    testImplementation("org.keycloak:keycloak-server-spi:26.7.3")
    testImplementation("org.keycloak:keycloak-server-spi-private:26.7.3")
    testImplementation("org.keycloak:keycloak-services:26.7.3")
    testImplementation("com.fasterxml.jackson.core:jackson-databind")
}

tasks.test { useJUnitPlatform() }
