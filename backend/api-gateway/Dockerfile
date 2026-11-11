FROM eclipse-temurin:25.0.5_8-jre@sha256:ecdc0adb37bde1a281c4d245a3cd535004b1fc8322d560f5b09463b248c81df0
# Compatible Ubuntu security patch; fail closed if the fixed package is absent.
# The application starts Java directly; the inherited Rockcraft supervisor is unused.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade --no-install-recommends -y apt libapt-pkg7.0 libpcre2-8-0 \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' apt)" ge 3.2.1ubuntu0.1 \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libapt-pkg7.0)" ge 3.2.1ubuntu0.1 \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libpcre2-8-0)" ge 10.46-1ubuntu0.1 \
    && rm -f /usr/bin/pebble \
    && test ! -e /usr/bin/pebble \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY api-gateway/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
