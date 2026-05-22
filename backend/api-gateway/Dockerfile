FROM gradle:8-jdk21 AS build
WORKDIR /workspace
COPY . .
RUN gradle :api-gateway:bootJar --no-daemon

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY --from=build /workspace/api-gateway/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
