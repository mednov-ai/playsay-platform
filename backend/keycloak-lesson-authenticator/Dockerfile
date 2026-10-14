FROM gradle:8.14.3-jdk21-alpine AS provider-build
WORKDIR /workspace
COPY build.gradle.kts /workspace/build.gradle.kts
COPY settings.gradle.kts /workspace/settings.gradle.kts
COPY src /workspace/src
RUN gradle --no-daemon clean jar

FROM gradle:8.14.3-jdk21-alpine AS server-runtime-build
USER root
# Maven version/checksum match the official Keycloak 26.8.1 wrapper.
RUN wget -q https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.16/apache-maven-3.9.16-bin.zip -O /tmp/maven.zip \
    && printf '%s  %s\n' 'ed41650d42485cfc243fad22158caf9cbb5dc408ce7a09ddb94dd42a019de929ca43065bfa450612cf12bf78b5cafa3884b96c090de326ff590448c933454af3' '/tmp/maven.zip' | sha512sum -c - \
    && unzip -q /tmp/maven.zip -d /opt \
    && rm /tmp/maven.zip \
    && chmod +x /opt/apache-maven-3.9.16/bin/mvn
WORKDIR /workspace/server-runtime
ENV MAVEN_OPTS="-Xmx768m -XX:MaxMetaspaceSize=256m"
COPY server-runtime/pom.xml server-runtime/settings.xml server-runtime/VerifyNetty.java server-runtime/VerifyRuntime.java ./
COPY server-runtime/src ./src
COPY --from=provider-build /workspace/build/libs/keycloak-lesson-authenticator-1.0.0.jar /tmp/keycloak-provider.jar
RUN /opt/apache-maven-3.9.16/bin/mvn -B -ntp -s settings.xml package \
    && java VerifyNetty.java target/lib/lib/main > target/netty-security-inventory.tsv \
    && java VerifyRuntime.java target/lib /tmp/keycloak-provider.jar > target/server-runtime-sha256.txt

# Rebuild the complete mutable-jar dependency model with Netty 4.1.139.
# Keycloak implementations and runtime OS/JDK remain on the pinned official image.
FROM quay.io/keycloak/keycloak@sha256:79c623a22abacf3fe6c00a5fb30f5b7843d717b234033b80995891c06116d244 AS keycloak-build
RUN rm -rf /opt/keycloak/lib
COPY --chown=1000:0 --from=server-runtime-build /workspace/server-runtime/target/lib/ /opt/keycloak/lib/
COPY --chown=1000:0 --from=server-runtime-build /workspace/server-runtime/target/netty-security-inventory.tsv /opt/keycloak/netty-security-inventory.tsv
COPY --chown=1000:0 --from=server-runtime-build /workspace/server-runtime/target/server-runtime-sha256.txt /opt/keycloak/server-runtime-sha256.txt
COPY --chown=1000:0 --from=provider-build /workspace/build/libs/keycloak-lesson-authenticator-1.0.0.jar /opt/keycloak/providers/keycloak-lesson-authenticator-1.0.0.jar
# These build-time options match both existing environment charts and avoid
# reaugmentation during a memory-constrained native DEV startup.
RUN JAVA_OPTS_KC_HEAP="-Xms128m -Xmx512m" /opt/keycloak/bin/kc.sh build --db=postgres --health-enabled=true --metrics-enabled=true --cache=local \
    && cd /opt/keycloak && sha256sum -c server-runtime-sha256.txt

FROM quay.io/keycloak/keycloak@sha256:79c623a22abacf3fe6c00a5fb30f5b7843d717b234033b80995891c06116d244
RUN rm -rf /opt/keycloak/lib
COPY --chown=1000:0 --from=keycloak-build /opt/keycloak/ /opt/keycloak/
COPY --chown=1000:0 server-runtime/entrypoint.sh /opt/keycloak/bin/playsay-entrypoint.sh
RUN chmod 755 /opt/keycloak/bin/playsay-entrypoint.sh
ENTRYPOINT ["/opt/keycloak/bin/playsay-entrypoint.sh"]
