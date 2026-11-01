# 01 — Mimari

## 1. Amaç ve tehdit modeli

Amaç: Öğrencinin **fiziksel olarak sınıfta** olduğunu, öğrenciye ek uygulama yükletmeden, kendi telefonunun tarayıcısı ve kendi mobil interneti üzerinden, iOS ve Android'de makul bir güvenle doğrulamak.

| Hile yöntemi | Karşı önlem |
|---|---|
| QR'ın fotoğrafını/ekran görüntüsünü arkadaşa göndermek | QR her `refreshMs` (varsayılan 1000 ms) değişir; ardışık en az 3 farklı QR canlı okunmalı; token yaşı sunucuda sınırlı |
| Sınıftaki arkadaşın canlı görüntülü araması ile QR'ı eve aktarmak | Telefonda, sunucu saatine senkronlu **optik gecikme ölçümü** (QR'daki ms damgası ile karenin yakalanma anı arasındaki fark); kalibrasyonla belirlenen eşik |
| Ekrandan (telefon/laptop) okutmak | Okunan anın kamera karesi kaydedilir; QR'ın karede kapladığı alan oranı ile otomatik "şüpheli" işaretleme |
| Aynı telefondan birden fazla öğrenci numarası girmek | Sunucu tarafından verilen HttpOnly cihaz çerezi (`YD`) + kamera `deviceId` özeti; oturum başına cihaz başına tek kayıt |
| Evden/kampüs dışından katılmak | Opsiyonel konum kontrolü (geofence, doğruluk eşiği) |
| Sahte BLE beacon | BLE challenge-response (HMAC, tek kullanımlık nonce) |
| QR'ı sahte üretmek | Tokenlar oturuma özel anahtar ile HMAC-SHA256 imzalı; anahtar yalnızca öğretim üyesinin kimliği doğrulanmış ekranına verilir |

Kabul edilen sınırlar: İstemcide yapılan ölçümler (kare zamanı, alan oranı) becerikli bir öğrenci tarafından JavaScript değiştirilerek sahtelenebilir. Bu yüzden sistem **"şüpheli" işaretler, öğretim üyesi karar verir**; yalnızca kriptografik/kesin ihlaller doğrudan reddedilir. Öğrenciye hangi kuralın tetiklendiği **asla gösterilmez**.

## 2. Aktörler ve bileşenler

```
┌────────────────────┐   HTTPS (oturum çerezi)   ┌──────────────────────────────────────┐
│ Öğretim üyesi      │ ───────────────────────▶  │ Spring Boot (tek JAR)                 │
│ - Dashboard (PC)   │ ◀──── SSE (canlı liste) ── │  /api/**      REST                     │
│ - Display (proj.)  │                           │  /api/public/** öğrenci uç noktaları    │
│ - Kalibrasyon (tel)│                           │  /**          Angular SPA (static/)    │
└────────────────────┘                           │                                        │
          │ projeksiyon                          │  Servisler: auth, course, classroom,   │
          ▼                                      │  session, checkin, decision, frames,   │
   ┌─────────────┐  kamera   ┌──────────────┐    │  live(SSE), export, retention jobs     │
   │ Dönen QR    │ ────────▶ │ Öğrenci tel. │ ─▶ │                                        │
   └─────────────┘           │ (tarayıcı)   │    └───────────┬───────────────┬───────────┘
                             └──────┬───────┘                │               │
                       BLE (opsiyonel, Android)        PostgreSQL/H2    Dosya sistemi
                             ┌──────▼───────┐                            (kamera kareleri)
                             │ ESP32 beacon │
                             └──────────────┘
```

### 2.1 Backend (Spring Boot)
Modüler monolit. Paketler (`com.yoklama.*`):

| Paket | Sorumluluk |
|---|---|
| `config` | `AppProperties`, web/SPA, Jackson, zamanlayıcı ayarları |
| `security` | Spring Security, oturum tabanlı giriş, CSRF (SPA modu), cihaz çerezi filtresi, rate limit |
| `common` | Hata modeli (`ApiException`, `ErrorCode`), yardımcılar, `Clock` bean'i |
| `crypto` | `Base32`, `Base36`, `Hmac`, `SessionKeyDerivation`, `QrTokenCodec`, `BleChallenge` |
| `teacher` | Öğretim üyesi kullanıcıları, başlangıç yöneticisi |
| `course` | Ders ve öğrenci listesi (roster), CSV içe aktarma |
| `classroom` | Derslik: geofence, BLE beacon anahtarı |
| `session` | Ders oturumu (yoklama penceresi), açma/kapama, display config, kalibrasyon |
| `checkin` | Öğrenci denemesi (`CheckinAttempt`), tarama kayıtları, tamamla akışı |
| `decision` | Karar motoru (kurallar → bayraklar → durum) |
| `attendance` | Yoklama kayıtları, öğretim üyesi kararı, manuel ekleme |
| `frames` | Kamera karesi saklama, servis etme, saklama süresi işi |
| `live` | SSE hub (oturum başına abone listesi) |
| `export` | CSV dışa aktarım |
| `time` | `/api/public/time` |

### 2.2 Frontend (Angular)
Tek SPA, iki ana alan:

- **Öğrenci alanı** (`/c/:code`): mobil öncelikli; numara girişi → izinler → tarayıcı (kamera + QR) → (opsiyonel BLE) → sonuç.
- **Öğretim üyesi alanı** (`/t/...`): giriş, dersler, roster, derslikler, oturum oluşturma, canlı dashboard, **display** (projeksiyon tam ekran dönen QR), **kalibrasyon** (öğretim üyesinin telefonu).

Ortak çekirdek: `ClockSyncService`, `ApiService`, `QrScannerEngine` (kamera + kare döngüsü + Web Worker'da zxing-wasm), `TokenCodec` (TS).

### 2.3 Opsiyonel ESP32 BLE beacon
Dersliğe bırakılan USB beslemeli kart. GATT servisi üzerinden nonce alır, `HMAC(bleKey, nonce)` döner. Sadece Android Chrome/Edge'de kullanılabilir (iOS'ta Web Bluetooth yok).

## 3. Ana akışlar

### 3.1 Oturum açma ve display
1. Öğretim üyesi dersi ve (opsiyonel) dersliği seçip oturum oluşturur, **Aç**'a basar.
2. Sunucu: benzersiz 6 karakterlik `code`, `epochStartMs` (bir sonraki tam saniye), `closesAt` belirler; durum `OPEN`.
3. Projeksiyondaki display sayfası `GET /api/sessions/{id}/display-config` ile **oturum anahtarını** (yalnızca sahibi alabilir), `epochStartMs`, `refreshMs` vb. alır.
4. Display, sunucu saatine senkronlanır; her slot `k` için `ts = epochStartMs + k*refreshMs` ve token `Y1.CODE.SEQ36.TS36.SIG` üretir (WebCrypto HMAC), QR'ı önceden offscreen canvas'a çizer, slot başında ekrana basar.

### 3.2 Öğrenci check-in
1. Öğrenci `https://<host>/c/<CODE>` açar (display'deki küçük statik QR veya kısa adres).
2. Öğrenci numarasını girer → `POST /api/public/checkins` (oturum açık mı, roster, tekrar, cihaz tekrarı kontrolleri) → `attemptId`.
3. Saat senkronu (8 örnek), kamera izni, (açıksa) konum izni.
4. Kare döngüsü: her kare için zaman damgası (sunucu saatine çevrilmiş) alınır, Worker'da QR çözülür. Yeni `seq` görüldüğünde **çözülen karenin zamanı** `firstSeenServerMs` olarak `POST .../scans` ile hemen gönderilir. İlk geçerli taramanın karesi JPEG olarak yüklenir.
5. `requiredScans` (3) farklı `seq` toplanınca kamera kapanır; (Android + BLE açıksa) BLE doğrulaması önerilir; saat tekrar ölçülür; `POST .../complete`.
6. Sunucu karar motorunu çalıştırır → `ACCEPTED` / `FLAGGED` (öğrenciye ikisi de "Kaydınız alındı") veya `REJECTED` (öğrenciye nedeni). SSE ile dashboard'a yayınlanır.

### 3.3 Kalibrasyon
Öğretim üyesi kendi telefonunda `/t/sessions/:id/calibrate` açar; ön/orta/arka sıradan birer tarama turu yapar. Her tur, en küçük optik gecikmeyi ve en büyük QR alan oranını ölçer. Oturumun `baselineLatencyMs` = turların medyanı; eşik = baseline + `latencyMarginMs`.

### 3.4 Canlı izleme ve karar
Dashboard SSE ile yeni kayıtları anında görür; şüpheli kayıtta kare görüntüsü, gecikme/eşik, alan oranı, konum gösterilir; öğretim üyesi **Onayla/Reddet** der. Telefonu olmayan öğrenci için **Manuel ekle**. CSV dışa aktarım.

## 4. Temel tasarım kararları

1. **Zaman otoritesi sunucudur.** Hiçbir kararda istemcinin duvar saati kullanılmaz; istemci `performance.now()` + ölçülmüş offset kullanır.
2. **Token, display tarayıcısında imzalanır** (sunucuda değil) — çünkü token'daki `ts` QR'ın ekrana basıldığı planlı an olmalı. `ts` planlı slot zamanıdır (`epochStart + seq*refresh`); sunucu bu eşitliği doğrular. Aynı oturumu açan birden fazla display aynı tokenları üretir (deterministik).
3. **Ölçümler ham olarak sunucuya gider**; gecikme, alan oranı ve kararlar sunucuda hesaplanır.
4. **Kesin ihlaller reddedilir, sezgisel sinyaller işaretlenir.** Öğrenciye bayraklar gösterilmez.
5. **QR içeriği alfanümerik moda uygundur** (yalnızca `A–Z 0–9 .`), en fazla 37 karakter → QR sürüm 2, ECC M, 25×25 modül. Uzaktan okunabilirlik için bilerek kısa tutulur.
6. **Tek dağıtım birimi:** Angular, Maven build sırasında derlenip JAR'ın içine gömülür.
7. **Kamera karesi şeffaf şekilde toplanır** (öğrenci sayfasında bilgi notu), düşük çözünürlükte saklanır, `retentionDays` sonra otomatik silinir.

## 5. Teknoloji yığını ve sürümler

| Katman | Seçim | Not |
|---|---|---|
| JDK | 21 (LTS) | 25 ile de çalışmalı |
| Build | Maven Wrapper (3.9.x) | `./mvnw` |
| Framework | Spring Boot **4.1.x** (en güncel yama) | Spring Framework 7, Spring Security 7, Hibernate 7, **Jackson 3** (`tools.jackson.*`; anotasyonlar `com.fasterxml.jackson.annotation` olarak kalır) |
| DB | H2 (dev, dosya tabanlı, `MODE=PostgreSQL`) / PostgreSQL 16+ (prod) | Flyway migration'ları her ikisinde de çalışmalı |
| Rate limit | Bucket4j (`com.bucket4j:bucket4j_jdk17-core`) | Bellek içi |
| Frontend | Angular **22** (CLI 22), standalone, zoneless, signals | Test: Vitest (Angular varsayılanı) |
| QR okuma | `zxing-wasm` 3.x (`zxing-wasm/reader`) | Web Worker içinde; `.wasm` yerel olarak sunulur |
| QR üretme | `qrcode` (node-qrcode) | `errorCorrectionLevel: 'M'` |
| Node | 24 LTS | `frontend-maven-plugin` indirir |
| Stil | Saf SCSS + CSS değişkenleri | UI kütüphanesi yok |
| Firmware | ESP32 + Arduino core + NimBLE-Arduino 2.x | Opsiyonel |

> Bağımlılık koordinatları ve starter isimleri için şüphe olursa **start.spring.io'nun Spring Boot 4.1.x için ürettiği** isimler esas alınır (Boot 4'te starter'lar modülerleşti: ör. `spring-boot-starter-webmvc`, `spring-boot-starter-flyway`).

## 6. Dizin yapısı (hedef)

```
yoklama/
├── pom.xml
├── mvnw, mvnw.cmd, .mvn/
├── AGENTS.md
├── README.md
├── .cursor/rules/*.mdc
├── docs/
├── src/
│   ├── main/
│   │   ├── java/com/yoklama/...        (paketler §2.1)
│   │   └── resources/
│   │       ├── application.yml
│   │       ├── application-dev.yml
│   │       ├── application-prod.yml
│   │       └── db/migration/V1__init.sql ...
│   └── test/java/com/yoklama/...
├── frontend/                            (Angular workspace, proje adı: yoklama-web)
│   ├── angular.json, package.json, tsconfig*.json, proxy.conf.json
│   └── src/app/
│       ├── core/        (api, clock-sync, device, token-codec, auth, sse)
│       ├── scanner/     (camera, frame-loop, decoder.worker.ts, scanner-engine, scanner.component)
│       ├── student/     (join, checkin-flow, result)
│       ├── teacher/     (login, courses, roster, classrooms, sessions, dashboard, display, calibrate)
│       └── shared/      (ui bileşenleri, pipes, styles)
├── firmware/ble-beacon/                 (ESP32 Arduino sketch)
├── deploy/                              (Dockerfile, docker-compose.yml, Caddyfile)
└── data/                                (çalışma zamanı: H2 dosyası, kareler — .gitignore)
```
