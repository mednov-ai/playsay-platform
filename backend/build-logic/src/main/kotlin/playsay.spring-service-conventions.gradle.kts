plugins {
    id("playsay.kotlin-conventions")
    id("org.jetbrains.kotlin.plugin.spring")
    id("org.springframework.boot")
    id("io.spring.dependency-management")
    id("dev.detekt")
}

// Spring Boot 4.0.8 supplies 11.0.24; the next Tomcat maintenance release fixes
// the 2026 access-control and session-expiration advisories.
extra["tomcat.version"] = "11.0.25"
extra["kotlin.version"] = "2.4.20"
extra["freemarker.version"] = "2.3.35"

detekt {
    toolVersion = "2.0.0-alpha.1"
    source.setFrom(files("src/main/kotlin"))
    config.setFrom(rootProject.files("config/detekt/detekt.yml"))
    baseline = rootProject.file("config/detekt/baseline/${project.name}.xml")
    buildUponDefaultConfig = false
    parallel = true
}

configurations.named("detekt") {
    resolutionStrategy.eachDependency {
        if (requested.group == "org.jetbrains.kotlin") {
            useVersion(dev.detekt.gradle.plugin.getSupportedKotlinVersion())
            because("Detekt must run with the Kotlin compiler version it was built against")
        }
    }
}

tasks.named("jar") {
    enabled = false
}

tasks.named("check") {
    setDependsOn(
        dependsOn.filterNot { dependency ->
            dependency is org.gradle.api.tasks.TaskProvider<*> && dependency.name == "detekt"
        },
    )
    dependsOn(tasks.named("detektMain"))
}
