FROM eclipse-temurin:21-jre
WORKDIR /app
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY payment-service/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
