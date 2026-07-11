FROM eclipse-temurin:21-jre
WORKDIR /app
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY ai-tutor-service/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8087
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
