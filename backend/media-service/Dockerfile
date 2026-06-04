FROM eclipse-temurin:21-jre
WORKDIR /app
ADD https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux /usr/local/bin/yt-dlp
RUN chmod 0755 /usr/local/bin/yt-dlp
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY media-service/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
