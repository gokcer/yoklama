# ---- Stage 1: build ----
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /build

# Maven wrapper + POM (cached layer)
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

# Frontend sources (separate layer for caching)
COPY frontend/package.json frontend/package-lock.json* frontend/
# Backend + frontend sources
COPY src src
COPY frontend frontend

RUN ./mvnw clean package -DskipTests -B

# ---- Stage 2: runtime ----
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /build/target/yoklama-*.jar app.jar
RUN addgroup -S yoklama && adduser -S yoklama -G yoklama
RUN mkdir -p /app/data/frames && chown -R yoklama:yoklama /app
USER yoklama
EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
