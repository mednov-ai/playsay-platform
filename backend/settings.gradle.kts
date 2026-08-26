pluginManagement {
    includeBuild("build-logic")
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
    }
}

rootProject.name = "playsay-backend"
include("api-gateway")
include("keyboard-service")
include("media-service")
include("payment-service")
include("registration-service")
include("email-service")
include("ai-tutor-service")
include("vocabulary-service")
include("worksheet-import-service")
include("architecture-testkit")
include("openai-support")
include("integration-support")
include("contracts:registration-internal-contract")
include("contracts:payment-internal-contract")
include("contracts:email-internal-contract")
include("contracts:media-internal-contract")
include("contracts:worksheet-import-internal-contract")
include("keycloak-lesson-authenticator")
