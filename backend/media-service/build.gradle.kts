plugins {
    id("playsay.spring-service-conventions")
}

dependencies {
    implementation(project(":contracts:media-internal-contract"))
    testImplementation(project(":architecture-testkit"))
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-jackson")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation(platform("software.amazon.awssdk:bom:2.44.12"))
    implementation("software.amazon.awssdk:s3")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
}
