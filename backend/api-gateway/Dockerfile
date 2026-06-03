FROM eclipse-temurin:21-jre
WORKDIR /app
ARG YT_DLP_VERSION=latest
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl python3 \
    && if [ "$YT_DLP_VERSION" = "latest" ]; then \
         curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o /usr/local/bin/yt-dlp; \
       else \
         curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp" -o /usr/local/bin/yt-dlp; \
       fi \
    && chmod 0755 /usr/local/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY api-gateway/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
