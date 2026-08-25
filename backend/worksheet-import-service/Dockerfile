FROM eclipse-temurin:21-jre
WORKDIR /app
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY worksheet-import-service/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8089
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
