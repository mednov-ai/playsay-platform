FROM gradle:8.14.3-jdk21-alpine AS provider-build
WORKDIR /workspace
COPY build.gradle.kts /workspace/build.gradle.kts
COPY settings.gradle.kts /workspace/settings.gradle.kts
COPY src /workspace/src
RUN gradle --no-daemon clean jar

# Keycloak 26.8.1; keep the provider SPI dependencies aligned.
FROM quay.io/keycloak/keycloak@sha256:79c623a22abacf3fe6c00a5fb30f5b7843d717b234033b80995891c06116d244 AS keycloak-build
COPY --from=provider-build /workspace/build/libs/keycloak-lesson-authenticator-1.0.0.jar /opt/keycloak/providers/keycloak-lesson-authenticator-1.0.0.jar
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak@sha256:79c623a22abacf3fe6c00a5fb30f5b7843d717b234033b80995891c06116d244
COPY --from=keycloak-build /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
