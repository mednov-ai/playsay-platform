FROM eclipse-temurin:25.0.5_8-jre
WORKDIR /app
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY keyboard-service/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
