FROM eclipse-temurin:25.0.5_8-jre
WORKDIR /app
COPY vocabulary-service/build/libs/*.jar /app/app.jar
EXPOSE 8088
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
