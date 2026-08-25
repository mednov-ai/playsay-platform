plugins {
    id("playsay.jpa-service-conventions")
}

dependencies {
    implementation(project(":openai-support"))
    implementation(project(":contracts:worksheet-import-internal-contract"))
    testImplementation(project(":architecture-testkit"))
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-jackson")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.springframework.boot:spring-boot-starter-liquibase")
    implementation("org.apache.pdfbox:pdfbox:3.0.8")
    implementation(platform("software.amazon.awssdk:bom:2.44.12"))
    implementation("software.amazon.awssdk:s3")
    runtimeOnly("org.postgresql:postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("com.h2database:h2")
}

tasks.withType<Test> {
    maxParallelForks = 1
    maxHeapSize = "512m"
    jvmArgs("-XX:MaxMetaspaceSize=256m")
}
