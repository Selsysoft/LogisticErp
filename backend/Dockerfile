FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
RUN useradd --system --no-create-home app \
    && mkdir -p /app/data/files \
    && chown -R app /app
WORKDIR /app
USER app
COPY --from=build /src/target/*.jar /app/app.jar
# Yüklenen dosyalar burada tutulur; kalıcı olması için bir birim bağlanmalıdır.
VOLUME /app/data/files
ENV FILES_ROOT=/app/data/files
EXPOSE 8080
# Bellek biterse süreç kapanır ve yeniden başlatılır; yarı çalışır durumda kalmaz.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/app.jar"]
