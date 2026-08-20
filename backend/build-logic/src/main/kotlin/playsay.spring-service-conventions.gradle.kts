plugins {
    id("playsay.kotlin-conventions")
    id("org.jetbrains.kotlin.plugin.spring")
    id("org.springframework.boot")
    id("io.spring.dependency-management")
    id("dev.detekt")
}

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
