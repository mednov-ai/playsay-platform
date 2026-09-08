FROM gradle:8.14.3-jdk21-alpine AS provider-build
WORKDIR /workspace
COPY build.gradle.kts /workspace/build.gradle.kts
COPY settings.gradle.kts /workspace/settings.gradle.kts
COPY src /workspace/src
RUN gradle --no-daemon clean jar

# Keycloak 26.7.3; keep the provider SPI dependencies aligned.
FROM quay.io/keycloak/keycloak@sha256:ff4257d0d64efbe99ed1ddfaf07765cc3c36dc7518bf8324d41961327f441c54 AS keycloak-build
COPY --from=provider-build /workspace/build/libs/keycloak-lesson-authenticator-1.0.0.jar /opt/keycloak/providers/keycloak-lesson-authenticator-1.0.0.jar
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak@sha256:ff4257d0d64efbe99ed1ddfaf07765cc3c36dc7518bf8324d41961327f441c54
COPY --from=keycloak-build /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
