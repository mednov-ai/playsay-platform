plugins {
    `java-library`
}

group = "com.playsay.keycloak"
version = "1.0.0"

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(21))
}

// Security inventory covers the rebuilt server, not just the SPI compilation closure.
val serverBuildTools by configurations.creating {
    isCanBeConsumed = false
    isCanBeResolved = true
}

val serverRuntime by configurations.creating {
    isCanBeConsumed = false
    isCanBeResolved = true
}

// Compatible fixed versions for findings exposed by the complete server/tool scan.
configurations.configureEach {
    resolutionStrategy.eachDependency {
        when (requested.group to requested.name) {
            "com.mysql" to "mysql-connector-j" -> useVersion("26.7.0")
            "io.airlift" to "aircompressor" -> useVersion("2.0.3")
            "org.codehaus.plexus" to "plexus-utils" -> useVersion("4.0.3")
        }
    }
}

dependencies {
    // Match the rebuilt Keycloak runtime and its coordinated Netty security update.
    compileOnly(enforcedPlatform("io.netty:netty-bom:4.1.139.Final"))
    testImplementation(enforcedPlatform("io.netty:netty-bom:4.1.139.Final"))
    compileOnly(platform("org.keycloak:keycloak-parent:26.8.1"))
    testImplementation(platform("org.keycloak:keycloak-parent:26.8.1"))
    compileOnly("org.keycloak:keycloak-server-spi:26.8.1")
    compileOnly("org.keycloak:keycloak-server-spi-private:26.8.1")
    compileOnly("org.keycloak:keycloak-services:26.8.1")
    compileOnly("com.fasterxml.jackson.core:jackson-databind")

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.11.4")
    testImplementation("org.mockito:mockito-core:5.15.2")
    testImplementation("org.keycloak:keycloak-server-spi:26.8.1")
    testImplementation("org.keycloak:keycloak-server-spi-private:26.8.1")
    testImplementation("org.keycloak:keycloak-services:26.8.1")
    testImplementation("com.fasterxml.jackson.core:jackson-databind")

    add(serverRuntime.name, enforcedPlatform("io.netty:netty-bom:4.1.139.Final"))
    add(serverRuntime.name, platform("org.keycloak:keycloak-parent:26.8.1"))
    add(serverRuntime.name, "org.keycloak:keycloak-quarkus-server:26.8.1")
    add(serverRuntime.name, "org.keycloak:keycloak-quarkus-server-deployment:26.8.1")
    add(serverRuntime.name, "com.fasterxml.jackson.core:jackson-databind")
    add(serverRuntime.name, "com.fasterxml.jackson.core:jackson-core")
    add(serverRuntime.name, "io.mvnpm:importmap")
    add(serverRuntime.name, "io.quarkus:quarkus-smallrye-openapi") {
        exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-metadata-jvm")
    }
    add(serverRuntime.name, "com.aayushatharva.brotli4j:native-linux-x86_64:1.23.0")

    add(serverBuildTools.name, "io.quarkus:quarkus-maven-plugin:3.40.1")
    add(serverBuildTools.name, "org.apache.maven.plugins:maven-resources-plugin:3.3.1")
    add(serverBuildTools.name, "org.apache.maven.plugins:maven-compiler-plugin:3.13.0")
    add(serverBuildTools.name, "org.apache.maven.plugins:maven-surefire-plugin:3.5.6")
    add(serverBuildTools.name, "org.apache.maven.plugins:maven-jar-plugin:3.5.0")

    // Quarkus packaging includes both supported Linux native transport classifiers.
    add(serverRuntime.name, "io.netty:netty-transport-native-epoll:4.1.139.Final:linux-x86_64")
    add(serverRuntime.name, "io.netty:netty-transport-native-epoll:4.1.139.Final:linux-aarch_64")

}

tasks.test { useJUnitPlatform() }
