# 09 — Dağıtım

## 1. Gereksinimler
- **HTTPS zorunlu.** Kamera, konum, Web Bluetooth ve WebCrypto yalnızca güvenli bağlamda çalışır. Öğrenciler mobil veriyle bağlandığı için sunucu internetten erişilebilir olmalı.
- Saat: sunucuda NTP açık olmalı (`timedatectl` → synchronized). Tüm gecikme ölçümü sunucu saatine göredir; sunucu saati kayarsa ölçüm bozulmaz (offset ölçülür) ama loglar yanıltıcı olur.
- Tek örnek (instance) çalıştırılır: SSE hub ve rate limit kovaları bellek içidir. Yatay ölçek gerekirse (gerekmez) SSE için Redis pub/sub eklenmeli.

## 2. Docker

### 2.1 `deploy/Dockerfile`
```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY . .
RUN ./mvnw -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd -r -u 1001 app && mkdir -p /app/data && chown app /app/data
COPY --from=build /src/target/yoklama-*.jar /app/app.jar
USER app
ENV SPRING_PROFILES_ACTIVE=prod JAVA_OPTS="-XX:MaxRAMPercentage=75"
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
```
(Build bağlamı repo kökü: `docker build -f deploy/Dockerfile .`; `.dockerignore`: `frontend/node_modules`, `frontend/node`, `frontend/dist`, `target`, `data`.)

### 2.2 `deploy/docker-compose.yml`
```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_DB: yoklama
      POSTGRES_USER: yoklama
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: [ "pgdata:/var/lib/postgresql/data" ]
    restart: unless-stopped
  app:
    build: { context: .., dockerfile: deploy/Dockerfile }
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/yoklama
      SPRING_DATASOURCE_USERNAME: yoklama
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD}
      APP_MASTER_SECRET: ${APP_MASTER_SECRET}
      APP_PUBLIC_BASE_URL: https://${DOMAIN}
      APP_ADMIN_USERNAME: ${ADMIN_USERNAME}
      APP_ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      APP_FRAMES_DIR: /app/data/frames
    volumes: [ "appdata:/app/data" ]
    depends_on: [ db ]
    restart: unless-stopped
  caddy:
    image: caddy:2
    ports: [ "80:80", "443:443" ]
    environment: { DOMAIN: "${DOMAIN}" }
    volumes: [ "./Caddyfile:/etc/caddy/Caddyfile", "caddy_data:/data" ]
    depends_on: [ app ]
    restart: unless-stopped
volumes: { pgdata: {}, appdata: {}, caddy_data: {} }
```

### 2.3 `deploy/Caddyfile`
```
{$DOMAIN} {
    encode gzip
    reverse_proxy app:8080 {
        flush_interval -1        # SSE için tamponlamayı kapat
    }
}
```

### 2.4 `deploy/.env.example`
```
DOMAIN=yoklama.ornek.edu.tr
DB_PASSWORD=degistirin
APP_MASTER_SECRET=          # openssl rand -base64 32
ADMIN_USERNAME=admin
ADMIN_PASSWORD=degistirin
```

## 3. Nginx kullanılacaksa
`proxy_set_header X-Forwarded-For/Proto/Host`; SSE yolu için `proxy_buffering off; proxy_read_timeout 1h;`.

## 4. Geliştirme sırasında telefonla test
- `./mvnw spring-boot:run` (dev) + ayrı terminalde `cd frontend && npm start` (4200, proxy'li) **veya** yalnızca 8080 (gömülü build).
- Telefon için HTTPS tüneli: `cloudflared tunnel --url http://localhost:8080` (veya `ngrok http 8080`). Çıkan `https://…` adresini `APP_PUBLIC_BASE_URL` olarak verin (display'deki katılım QR'ı bu adresi kullanır).
- Tünel ek gecikme yaratır ama optik gecikme ölçümünü **etkilemez** (ölçüm kare zamanı ile QR damgası arasındadır; ağ gecikmesi yalnızca saat senkronu RTT'sine yansır).

## 5. Yedekleme ve saklama
- PostgreSQL için günlük `pg_dump`. Kareler `retention-days` sonunda zaten silinir; yedeklenmesi gerekmez.
- `APP_MASTER_SECRET` değişirse açık oturumların display'leri yeniden açılmalı; kapalı oturumlar etkilenmez.
