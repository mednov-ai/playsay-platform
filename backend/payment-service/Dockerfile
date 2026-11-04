FROM eclipse-temurin:25.0.5_8-jre
WORKDIR /app
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY payment-service/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
