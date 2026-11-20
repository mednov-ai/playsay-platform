FROM alpine:3.23@sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2 AS patched-jre
COPY gradle/prepare-temurin-jre.sh /prepare-temurin-jre.sh
RUN sh /prepare-temurin-jre.sh

FROM eclipse-temurin:25.0.5_8-jre@sha256:ecdc0adb37bde1a281c4d245a3cd535004b1fc8322d560f5b09463b248c81df0
# Compatible Ubuntu security patch; fail closed if the fixed package is absent.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade --no-install-recommends -y apt libapt-pkg7.0 libpcre2-8-0 \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' apt)" ge 3.2.1ubuntu0.1 \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libapt-pkg7.0)" ge 3.2.1ubuntu0.1 \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libpcre2-8-0)" ge 10.46-1ubuntu0.1 \
    && rm -rf /var/lib/apt/lists/* /opt/java/openjdk
COPY --from=patched-jre /opt/temurin/ /opt/java/openjdk/
RUN java -version && grep -Fx 'IMPLEMENTOR_VERSION="Temurin-25.0.5.1+2"' /opt/java/openjdk/release
WORKDIR /app
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY keyboard-service/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
