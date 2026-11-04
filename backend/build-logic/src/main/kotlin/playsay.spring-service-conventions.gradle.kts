import groovy.json.JsonSlurper
import java.security.MessageDigest
import java.util.HexFormat
import java.util.zip.ZipFile
import org.springframework.boot.gradle.tasks.bundling.BootJar

plugins {
    id("playsay.kotlin-conventions")
    id("org.jetbrains.kotlin.plugin.spring")
    id("org.springframework.boot")
    id("io.spring.dependency-management")
    id("dev.detekt")
}

// Spring Boot 4.1.2 manages Tomcat 11.0.27, newer than the previous security override.
extra["kotlin.version"] = "2.4.20"
extra["freemarker.version"] = "2.3.35"

dependencies {
    // Boot 4 uses Jackson 3 for HTTP; Jackson 2 codecs do not provide Kotlin defaults here.
    add("implementation", "tools.jackson.module:jackson-module-kotlin")
}

detekt {
    toolVersion = "2.0.0-alpha.6"
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

val runtimeScopePolicy = rootProject.file("gradle/dependency-security-runtime-scope.json")
tasks.withType<BootJar>().configureEach {
    inputs.file(runtimeScopePolicy).withPropertyName("buildOnlyRuntimeScopePolicy")
    doLast {
        val document = JsonSlurper().parse(runtimeScopePolicy) as Map<*, *>
        val blocked = (document["rules"] as List<*>).mapNotNull { value ->
            val rule = value as? Map<*, *> ?: return@mapNotNull null
            (rule["sha256"] as? String)?.takeIf { rule["kind"] == "build-only-direct" }
        }.toSet()
        check(blocked.isNotEmpty()) { "Missing build-only runtime-boundary evidence" }
        ZipFile(archiveFile.get().asFile).use { archive ->
            archive.entries().asSequence()
                .filter { it.name.startsWith("BOOT-INF/lib/") && it.name.endsWith(".jar") }
                .forEach { entry ->
                    val digest = MessageDigest.getInstance("SHA-256")
                    archive.getInputStream(entry).use { stream ->
                        val buffer = ByteArray(16 * 1024)
                        while (true) {
                            val count = stream.read(buffer)
                            if (count < 0) break
                            digest.update(buffer, 0, count)
                        }
                    }
                    val hash = HexFormat.of().formatHex(digest.digest())
                    check(hash !in blocked) { "Build-only dependency entered server runtime: ${entry.name}" }
                }
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
