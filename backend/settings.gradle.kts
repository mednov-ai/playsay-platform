pluginManagement {
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
include("shared-kotlin")
