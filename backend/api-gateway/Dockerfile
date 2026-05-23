FROM eclipse-temurin:21-jre
WORKDIR /app
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY api-gateway/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
