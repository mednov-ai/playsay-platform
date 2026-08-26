FROM gradle:8.14.3-jdk21-alpine AS provider-build
WORKDIR /workspace
COPY build.gradle.kts /workspace/build.gradle.kts
COPY src /workspace/src
RUN gradle --no-daemon clean jar

FROM quay.io/keycloak/keycloak@sha256:f1f1f01e472c8a78df40d8f2a49a925274eda4d3d80d5f6edbb5c880ee3c01c6 AS keycloak-build
COPY --from=provider-build /workspace/build/libs/keycloak-lesson-authenticator-1.0.0.jar /opt/keycloak/providers/keycloak-lesson-authenticator-1.0.0.jar
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak@sha256:f1f1f01e472c8a78df40d8f2a49a925274eda4d3d80d5f6edbb5c880ee3c01c6
COPY --from=keycloak-build /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
