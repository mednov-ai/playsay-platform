FROM eclipse-temurin:21-jre
WORKDIR /app
COPY build/libs/ai-tutor-service-*.jar app.jar
EXPOSE 8087
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
