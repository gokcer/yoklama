# 05 — Backend Uygulama Rehberi (Spring Boot 4.1.x)

## 1. Maven projesi

- `groupId=com.yoklama`, `artifactId=yoklama`, `packaging=jar`, Java 21.
- Parent: `org.springframework.boot:spring-boot-starter-parent:4.1.x` (en güncel yama).
- Maven Wrapper eklenmeli (`mvn -N wrapper:wrapper` veya Initializr çıktısı).

### 1.1 Bağımlılıklar
```
spring-boot-starter-webmvc
spring-boot-starter-security
spring-boot-starter-data-jpa
spring-boot-starter-validation
spring-boot-starter-flyway
spring-boot-starter-actuator
org.flywaydb:flyway-database-postgresql
com.h2database:h2                              (runtime)
org.postgresql:postgresql                      (runtime)
com.bucket4j:bucket4j_jdk17-core               (sürüm: güncel 8.x)
com.github.ben-manes.caffeine:caffeine         (rate limit kovaları için süreli harita)

test:
spring-boot-starter-test
spring-boot-starter-webmvc-test                (MockMvc otomatik konfigürasyonu Boot 4'te bu modülde)
spring-boot-starter-data-jpa-test              (gerekirse)
spring-security-test
```
> Boot 4 starter/test modül isimlerinde tereddüt olursa start.spring.io'nun Boot 4.1.x çıktısı esastır. Boot 4'te `@AutoConfigureMockMvc` gibi test anotasyonlarının paketleri değişti (`org.springframework.boot.webmvc.test.autoconfigure`); IDE önerisine göre import edin.
> Jackson 3: JSON için Spring'in otomatik yapılandırdığı `tools.jackson.databind.json.JsonMapper` kullanılır. `@JsonProperty`, `@JsonInclude` gibi anotasyonlar `com.fasterxml.jackson.annotation` paketinde kalır. `com.fasterxml.jackson.databind.ObjectMapper` **kullanılmaz**.

### 1.2 Frontend entegrasyonu (pom.xml)
`com.github.eirslett:frontend-maven-plugin` (güncel sürüm), `workingDirectory=frontend`:

| Execution | Faz | Hedef / argüman |
|---|---|---|
| install-node-and-npm | generate-resources | `nodeVersion=v24.x.y` (güncel 24 LTS), npm ile gelen sürüm |
| npm-ci | generate-resources | `npm ci` |
| npm-test | test | `npm run test -- --watch=false` (`-DskipTests` veya `-DskipFrontendTests` ile atlanır) |
| npm-build | generate-resources | `npm run build -- --configuration production` |

`maven-resources-plugin` `copy-resources` (faz `process-resources`): `frontend/dist/yoklama-web/browser/**` → `${project.build.outputDirectory}/static`.

Profil `-Pno-frontend`: frontend execution'larını atlar (backend'e odaklı hızlı geliştirme için). `frontend/node`, `frontend/node_modules`, `frontend/dist`, `frontend/.angular` `.gitignore`'a eklenir.

## 2. Konfigürasyon

### 2.1 `application.yml`
```yaml
spring:
  application.name: yoklama
  profiles.default: dev
  jpa:
    open-in-view: false
    hibernate.ddl-auto: validate
  servlet.multipart:
    max-file-size: 512KB
    max-request-size: 1MB
server:
  forward-headers-strategy: framework
  servlet.session:
    timeout: 12h
    cookie:
      http-only: true
      same-site: lax
  compression.enabled: true
management:
  endpoints.web.exposure.include: health
  endpoint.health.show-details: never

app:
  master-secret: ${APP_MASTER_SECRET:}
  public-base-url: ${APP_PUBLIC_BASE_URL:http://localhost:8080}
  admin:
    username: ${APP_ADMIN_USERNAME:}
    password: ${APP_ADMIN_PASSWORD:}
  privacy-notice: "Doğrulama amacıyla, QR okutulduğu andaki kamera görüntüsü kaydedilir ve 7 gün sonra otomatik silinir."
  device-cookie:
    name: YD
    max-age-days: 400
    secure: true
  frames:
    dir: ${APP_FRAMES_DIR:./data/frames}
    max-bytes: 300000
    retention-days: 7
  retention:
    attempt-days: 30
  rate-limit:
    per-device-per-minute: 120
    per-ip-per-minute: 1500        # mobil operatör CGNAT: çok sayıda öğrenci aynı IP'yi paylaşabilir
    starts-per-device-per-10min: 10
    login-per-ip-per-minute: 20
  ble:
    service-uuid: 8f3a0001-5c2e-4b7a-9d61-3e0f7a2b9c10
    nonce-char-uuid: 8f3a0002-5c2e-4b7a-9d61-3e0f7a2b9c10
    response-char-uuid: 8f3a0003-5c2e-4b7a-9d61-3e0f7a2b9c10
    nonce-ttl-ms: 60000
  checkin:
    # 07-DECISION-ENGINE.md §6'daki tüm anahtarlar burada
```

### 2.2 Profiller
- `application-dev.yml`: `spring.datasource.url=jdbc:h2:file:./data/yoklama-dev;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH`, `app.device-cookie.secure=false`, `app.admin.username=admin`, `app.admin.password=admin123` (ortam değişkeni yoksa).
- `application-prod.yml`: datasource ortam değişkenlerinden (`SPRING_DATASOURCE_URL/USERNAME/PASSWORD`), `server.servlet.session.cookie.secure=true`, `app.device-cookie.secure=true`. `app.master-secret` boşsa başlangıçta `IllegalStateException`.
- Test: `src/test/resources/application-test.yml` → H2 bellek içi, sabit `master-secret` (32 bayt `00..1f`, base64: `AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=`).

### 2.3 `AppProperties`
`@ConfigurationProperties(prefix = "app")` record yapısı; iç içe record'lar (`Admin`, `DeviceCookie`, `Frames`, `Retention`, `RateLimit`, `Ble`, `Checkin(Defaults, ...)`). `@Validated` ile zorunlu alanlar.

## 3. Paket ve sınıf planı

```
com.yoklama
├── YoklamaApplication                 (@SpringBootApplication, @EnableScheduling, @ConfigurationPropertiesScan)
├── config
│   ├── ClockConfig                    (@Bean Clock clock() = Clock.systemUTC())
│   ├── SpaWebConfig                   (§5)
│   └── MasterSecretConfig             (@Bean MasterSecret — prod'da zorunlu, dev'de rastgele + WARN)
├── security
│   ├── SecurityConfig                 (§4)
│   ├── TeacherUserDetailsService
│   ├── CurrentTeacher                 (SecurityContext'ten TeacherUser; sahiplik yardımcıları)
│   ├── DeviceCookieFilter             (§6)
│   └── RateLimitFilter                (§7)
├── common
│   ├── ErrorCode (enum: http status + TR mesaj)
│   ├── ApiException
│   ├── GlobalExceptionHandler         (@RestControllerAdvice → {code,message,details})
│   └── Csv                            (ayırıcı tespiti, kaçış, BOM)
├── crypto
│   ├── Base32, Base36, Hmac
│   ├── SessionKeyDerivation
│   ├── QrToken (record), QrTokenCodec
│   └── BleChallenge
├── teacher        TeacherUser, TeacherUserRepository, AdminBootstrap (ApplicationRunner), AdminTeacherController
├── course         Course, RosterEntry, repos, CourseService, RosterImportService, CourseController
├── classroom      Classroom, repo, ClassroomService, ClassroomController
├── session        ClassSession, SessionStatus, GeoMode, BleMode, CalibrationRun, repos,
│                  SessionService, SessionCodeGenerator, CalibrationService, SessionController,
│                  SessionAutoCloseJob
├── checkin        CheckinAttempt, AttemptState, ScanRecord, repos, CheckinService,
│                  ScanValidator, PublicCheckinController, PublicSessionController, AttemptExpiryJob
├── decision       DecisionEngine, DecisionInput, Decision, Flag, GeoMath
├── attendance     Attendance, AttendanceStatus, TeacherDecision, FlagSetConverter, repo,
│                  AttendanceService, AttendanceController, AttendanceDto (+ mapper)
├── frames         FrameStorage (interface), FileSystemFrameStorage, FrameRetentionJob
├── live           SseHub, LiveEvents (domain olayları), LiveEventPublisher (@TransactionalEventListener)
├── export         CsvExportService
└── time           TimeController
```

DTO'lar `record` olarak, ilgili paketin `dto` alt paketinde. Bean Validation anotasyonları ile.

## 4. Güvenlik

```java
@Bean
SecurityFilterChain securityFilterChain(HttpSecurity http,
        DeviceCookieFilter deviceCookieFilter, RateLimitFilter rateLimitFilter) throws Exception {
    http
        .csrf(csrf -> csrf
            .spa()                                         // XSRF-TOKEN çerezi + X-XSRF-TOKEN başlığı
            .ignoringRequestMatchers("/api/public/**"))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/public/**", "/api/auth/login", "/api/auth/csrf",
                             "/actuator/health").permitAll()
            .requestMatchers("/api/admin/**").hasRole("ADMIN")
            .requestMatchers("/api/**").authenticated()
            .anyRequest().permitAll())                     // SPA ve statik dosyalar
        .exceptionHandling(e -> e
            .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
        .formLogin(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .logout(l -> l.logoutUrl("/api/auth/logout")
            .logoutSuccessHandler((req, res, a) -> res.setStatus(204)))
        .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
        .addFilterAfter(deviceCookieFilter, RateLimitFilter.class);
    return http.build();
}
```

Giriş (`AuthController`):
```java
@PostMapping("/api/auth/login")
public MeDto login(@Valid @RequestBody LoginRequest req, HttpServletRequest request, HttpServletResponse response) {
    Authentication auth = authenticationManager.authenticate(
        UsernamePasswordAuthenticationToken.unauthenticated(req.username(), req.password()));
    request.getSession(true);
    request.changeSessionId();                       // session fixation koruması
    SecurityContext ctx = SecurityContextHolder.createEmptyContext();
    ctx.setAuthentication(auth);
    SecurityContextHolder.setContext(ctx);
    securityContextRepository.saveContext(ctx, request, response);   // HttpSessionSecurityContextRepository bean
    return MeDto.from(currentTeacher(auth));
}
```
- `AuthenticationManager`: `DaoAuthenticationProvider` + `TeacherUserDetailsService` + `PasswordEncoderFactories.createDelegatingPasswordEncoder()` (bcrypt).
- Hatalı giriş → `401 UNAUTHORIZED`. Giriş uç noktası IP başına rate limit'li.
- `AdminBootstrap`: hiç kullanıcı yoksa ve `app.admin.username/password` doluysa ADMIN oluşturur; yoksa WARN.
- Sahiplik: her öğretim üyesi servisi `CurrentTeacher.requireOwner(entity.ownerId)`; ADMIN geçer.

## 5. SPA sunumu
```java
@Configuration
public class SpaWebConfig implements WebMvcConfigurer {
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
            .addResourceLocations("classpath:/static/")
            .resourceChain(true)
            .addResolver(new PathResourceResolver() {
                @Override
                protected Resource getResource(String path, Resource location) throws IOException {
                    if (path.startsWith("api/") || path.startsWith("actuator/")) return null;
                    Resource requested = location.createRelative(path);
                    if (requested.exists() && requested.isReadable()) return requested;
                    return location.createRelative("index.html");
                }
            });
    }
}
```
- `index.html` için `Cache-Control: no-cache` (bir `OncePerRequestFilter` veya `ResourceHttpRequestHandler` ayarı); hash'li dosyalar (`*.js`, `*.css` adında hash olanlar) 1 yıl.
- `.wasm` için `application/wasm` MIME türü kayıtlı olmalı (Spring varsayılanında yoksa `WebServerFactoryCustomizer` ile `MimeMappings` ekleyin).
- Ek güvenlik başlıkları (`HeadersConfigurer`): `Permissions-Policy: camera=(self), geolocation=(self), bluetooth=(self)`, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`. CSP: `default-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'`.

## 6. Cihaz çerezi
`DeviceCookieFilter extends OncePerRequestFilter`, yalnızca `/api/public/**`:
- `YD` çerezi yoksa veya formatı (`^[A-Z2-7]{26}$`) geçersizse: 16 bayt `SecureRandom` → Base32 → `ResponseCookie.from(name, value).httpOnly(true).secure(props.secure).sameSite("Lax").path("/").maxAge(Duration.ofDays(400))`.
- Değeri `request.setAttribute("deviceId", value)`; controller'lar `@RequestAttribute("deviceId")` ile alır.

## 7. Rate limit
`RateLimitFilter` (yalnızca `POST /api/public/**` ve `POST /api/auth/login`):
- Kova anahtarları: `dev:{YD}`, `ip:{remoteAddr}`, `start:{YD}`, `login:{ip}`. Caffeine `Cache<String, Bucket>` (`expireAfterAccess(15 dk)`).
- Bucket4j: `Bandwidth.builder().capacity(n).refillGreedy(n, period).build()`.
- Aşımda `429` + `{code:"RATE_LIMITED"}` + `Retry-After`.
- IP: `request.getRemoteAddr()` (`forward-headers-strategy=framework` ile proxy arkasında doğru IP).

## 8. Kripto referans kodu

```java
public final class Base32 {
    private static final char[] ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();
    private Base32() {}
    public static String encode(byte[] data) {
        StringBuilder sb = new StringBuilder((data.length * 8 + 4) / 5);
        int buffer = 0, bits = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xFF);
            bits += 8;
            while (bits >= 5) {
                sb.append(ALPHABET[(buffer >>> (bits - 5)) & 31]);
                bits -= 5;
            }
        }
        if (bits > 0) sb.append(ALPHABET[(buffer << (5 - bits)) & 31]);
        return sb.toString();
    }
}

public final class Hmac {
    private Hmac() {}
    public static byte[] sha256(byte[] key, byte[] message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(message);
        } catch (GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
}

public final class SessionKeyDerivation {
    public static byte[] derive(byte[] masterSecret, long sessionId, String code) {
        return Hmac.sha256(masterSecret,
            ("Y1-SESSION|" + sessionId + "|" + code).getBytes(StandardCharsets.US_ASCII));
    }
}

public record QrToken(String code, int seq, long ts, String raw) {}

public final class QrTokenCodec {
    public static final Pattern FORMAT = Pattern.compile(
        "^Y1\\.([A-HJ-NP-Z2-9]{6})\\.([0-9A-Z]{1,4})\\.([0-9A-Z]{1,9})\\.([A-Z2-7]{13})$");

    public static String prefix(String code, int seq, long ts) {
        return "Y1." + code + "." + Base36.encode(seq) + "." + Base36.encode(ts);
    }

    public static String sign(byte[] key, String code, int seq, long ts) {
        String p = prefix(code, seq, ts);
        byte[] mac = Hmac.sha256(key, p.getBytes(StandardCharsets.US_ASCII));
        return p + "." + Base32.encode(Arrays.copyOf(mac, 8));
    }

    /** Yalnızca format; imza doğrulamaz. Kanonik olmayan base36 (baştaki 0) sign() karşılaştırmasında elenir. */
    public static Optional<QrToken> parse(String raw) {
        if (raw == null) return Optional.empty();
        Matcher m = FORMAT.matcher(raw);
        if (!m.matches()) return Optional.empty();
        long seq = Base36.decode(m.group(2));
        long ts = Base36.decode(m.group(3));
        if (seq > Integer.MAX_VALUE) return Optional.empty();
        return Optional.of(new QrToken(m.group(1), (int) seq, ts, raw));
    }

    public static boolean verify(byte[] key, QrToken t) {
        String expected = sign(key, t.code(), t.seq(), t.ts());
        return MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.US_ASCII), t.raw().getBytes(StandardCharsets.US_ASCII));
    }
}
```
`BleChallenge.response(byte[] bleKey, String nonce)` → `HexFormat.of().withUpperCase().formatHex(Arrays.copyOf(Hmac.sha256(bleKey, nonce ASCII), 8))`; doğrulamada sabit zamanlı karşılaştırma.

Tüm vektörler (02 §1.2, §2.2, §3.2, §10.2) `crypto` testlerinde birebir yer almalı.

## 9. Servis davranışları

### 9.1 `SessionService`
- `create(req)`: varsayılanları uygula, doğrula (04 §4.4), `DRAFT`, geçici kod üret (OPEN'da yeniden üretilmez; DRAFT'ta da benzersiz).
- `open(id)`: `DRAFT` olmalı. `epochStartMs = ceil(clock.millis()/1000)*1000`; `openedAt=now`; `closesAt = openedAt + durationMinutes`; `status=OPEN`. SSE `session`.
- `close(id)`, `extend(id, minutes)`; `SessionAutoCloseJob` (`@Scheduled(fixedDelay=10s)`): `OPEN && closesAt <= now` → `CLOSED`, SSE `session`.
- `displayConfig(id)`: OPEN + sahip; `sessionKey = SessionKeyDerivation.derive(master, id, code)`; base64.
- `effectiveLatencyThreshold(session)`: 07 §2.
- `sessionKey(session)` metodu `CheckinService` ve `CalibrationService` tarafından da kullanılır (önbelleğe alınabilir: `ConcurrentHashMap<Long, byte[]>`).

### 9.2 `CheckinService`
- `start(code, studentNo, client, deviceId, ip)`: 04 §2 kontrolleri; `CheckinAttempt(state=SCANNING, expiresAt=now+ttl)`.
- `recordSync(attemptId, deviceId, offset, rtt)`.
- `recordScan(attemptId, deviceId, req)`: `arrivalMs = clock.millis()` metodun **ilk satırında** alınır. `ScanValidator` 02 §7'yi uygular. `areaRatio` sunucuda shoelace ile hesaplanır (köşeler 4 nokta değilse `null`). `ScanRecord` kaydedilir. Yanıt: geçerli farklı seq sayısı ve tamamlama koşulu.
- `storeFrame(attemptId, deviceId, multipart, seq)`: deneme SCANNING; boyut + JPEG imzası; `FrameStorage.save(sessionId, attemptId, bytes)`; `attempt.framePath`.
- `bleNonce(...)`, `bleVerify(...)`: 02 §10.
- `complete(attemptId, deviceId, req)`: `@Transactional`; `DecisionEngine` girdisini hazırla (oturum, derslik, geçerli taramalar, aynı oturumdaki `cameraIdHash` eşleşmesi, mevcut attendance kontrolleri); karar → `Attendance` oluştur (frame yolu attempt'ten), attempt `COMPLETED`; kesin redde attempt `REJECTED` + `resultCode` ve `ApiException` fırlat. Benzersizlik ihlalini yakala ve doğru koda çevir. Commit sonrası SSE.
- Deneme sahipliği: `attempt.deviceId` ile istekteki `YD` eşleşmeli; değilse `ATTEMPT_NOT_FOUND` (bilgi sızdırmamak için).

### 9.3 `CalibrationService`
- Taramaları `ScanValidator` ile doğrular (deneme oluşturmadan; arrival = istek anı). Kalibrasyon toplu gönderildiği için yaş kontrolünde `arrivalMs` yerine her taramanın `firstSeenServerMs`'i ile `ts` farkı `maxTokenAgeMs` içinde olmalı ve en son tarama `arrivalMs − 30 000` sonrasında olmalı (eski verinin tekrar gönderilmesini engeller).
- `CalibrationRun` kaydı + oturum baseline'ını yeniden hesaplar (07 §5).

### 9.4 `AttendanceService`
- `list(sessionId)`, `decide(attId, decision, note)` (decidedAt), `manualAdd(sessionId, studentNo, note)` (roster'dan ad), `delete(attId)` (kare dosyasını da sil), `reevaluate(sessionId)` (Faz 9).
- Her değişiklikte `LiveEvents.AttendanceChanged` yayınla.

### 9.5 `SseHub`
```java
private final Map<Long, Set<SseEmitter>> emitters = new ConcurrentHashMap<>();
public SseEmitter subscribe(long sessionId) {
    SseEmitter e = new SseEmitter(Duration.ofMinutes(30).toMillis());
    emitters.computeIfAbsent(sessionId, k -> ConcurrentHashMap.newKeySet()).add(e);
    Runnable remove = () -> emitters.getOrDefault(sessionId, Set.of()).remove(e);
    e.onCompletion(remove); e.onTimeout(remove); e.onError(t -> remove.run());
    return e;
}
public void publish(long sessionId, String event, Object data) { /* her emitter'a send; IOException'da kaldır */ }
@Scheduled(fixedRate = 15_000) void heartbeat() { /* SseEmitter.event().comment("ping") */ }
```
Olaylar `@TransactionalEventListener(phase = AFTER_COMMIT)` ile yayınlanır. Yanıt başlığı `X-Accel-Buffering: no` (proxy tamponlamasını kapatır).

### 9.6 `FrameStorage`
- `save(sessionId, attemptId, bytes)` → `"{sessionId}/{attemptId}.jpg"` (dizin yoksa oluştur). Yollar `Path.normalize()` + kök içinde mi kontrolü.
- `load(relPath)`, `delete(relPath)`, `deleteSessionDir(sessionId)`.
- `FrameRetentionJob` (`@Scheduled(cron = "0 30 3 * * *")`): `closedAt < now − retentionDays` olan oturumların karelerini sil, `attendance.frame_path=null`, `checkin_attempt.frame_path=null`. Ayrıca `attempt-days`'ten eski oturumların `checkin_attempt` kayıtlarını sil (scan_record cascade).

### 9.7 `RosterImportService`
- BOM'u atla; ilk satırda `;` sayısı ≥ `,` sayısı ise `;`; tırnaklı alanları destekle; başlık satırı ilk sütun sayı değilse atlanır; `studentNo` regex'e uymayan satırlar `errors`'a.
- `REPLACE`: mevcut roster silinip yenisi yazılır; `MERGE`: upsert (ad güncellenir).

### 9.8 `CsvExportService`
- BOM + `;` ayırıcı + `\r\n`. Alanlarda `;`, `"` veya satır sonu varsa tırnakla. Formül enjeksiyonuna karşı `=,+,-,@` ile başlayan hücrelerin başına `'` eklenir.
- Dosya adı: `yoklama_{courseCode}_{yyyyMMdd-HHmm}.csv` (`Content-Disposition`).

## 10. Hata yönetimi
- `ApiException(ErrorCode code, Map<String,Object> details)`.
- `GlobalExceptionHandler`: `ApiException` → kendi durumu; `MethodArgumentNotValidException`/`ConstraintViolationException` → `VALIDATION_ERROR` (alan hataları `details`'te); `AccessDeniedException` → 403; `NoResourceFoundException` → 404; beklenmeyen → 500 (`code=INTERNAL`, log ERROR, istemciye iç detay yok).

## 11. Loglama
- Her check-in sonucu INFO: `checkin sessionId=… studentNo=… status=… flags=… minLatency=… threshold=…`.
- Ham token, oturum anahtarı, BLE anahtarı **asla** loglanmaz.
