# Spring Boot 4 HTTP Kotlin defaults correction

Production acceptance of source `4848a1f1920ab41d45b061c1bd78f567b05db580` exposed anonymous keyboard result requests rejected during Jackson 3 HTTP deserialization. The frontend legitimately omits optional fields such as `practiceContext`; their Kotlin constructor defaults must apply.

The shared Spring service convention now includes Boot-managed `tools.jackson.module:jackson-module-kotlin` in all nine Spring application modules. Existing Jackson 2 internal and persistence codecs remain unchanged. The standalone Keycloak provider does not use this convention.

`KeyboardHttpJsonDefaultsTest` reads anonymous and authenticated result DTOs through the actual Spring MVC handler adapter converter. Both tests fail with `HttpMessageNotReadableException` / `tools.jackson.databind.exc.MismatchedInputException` before the dependency and pass with it using Gradle 9.5.1 / JDK 25. The initial after-fix compilation exhausted the default 512 MiB Gradle heap; rerunning with a 2 GiB compiler heap passed. This local result does not establish fresh image security or production acceptance.

While preparing corrected native CI images, production GitOps restores only the eight active previously accepted Spring image/build references. PostgreSQL 17.11 clusters and the newly authoritative Keycloak database, Keycloak image, LiveKit, collaboration and frontend images remain in place. Do not revert the whole release or switch identity JDBC to its stale old database. Worksheet automatic synchronization is paused to prevent partial promotion during CI publication.

Require fresh native tests, dependency/security scans and immutable images for the corrected source, current backup/restore and schema/activity gates, then both-origin authenticated classroom/media and keyboard acceptance before advancing the accepted production pointer.

Upstream guidance: https://kotlinlang.org/docs/jvm-create-project-with-spring-boot.html and https://docs.spring.io/spring-boot/reference/features/json.html.
