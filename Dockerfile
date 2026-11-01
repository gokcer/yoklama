FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY target/yoklama-*.jar app.jar
RUN addgroup -S yoklama && adduser -S yoklama -G yoklama
RUN mkdir -p /app/data/frames && chown -R yoklama:yoklama /app
USER yoklama
EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
