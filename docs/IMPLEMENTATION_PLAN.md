# Uygulama Planı

Fazlar **sırayla** uygulanır. Her faz bitiminde: ilgili testler yazılır ve geçer, `./mvnw verify` (ve frontend varsa `npm test`) yeşil olur, bu dosyadaki kutucuklar işaretlenir (`- [x]`). Kabul kriteri sağlanmadan sonraki faza geçilmez. Doküman dışı her karar `docs/DECISIONS.md`'ye bir satır olarak yazılır.

---

## Faz 0 — İskelet ve build entegrasyonu
- [x] Spring Boot 4.1.x Maven projesi (`com.yoklama`, Java 21), Maven Wrapper, `.gitignore`, `.editorconfig`
- [x] Bağımlılıklar (05 §1.1), `application.yml` + `dev`/`prod`/`test` profilleri (05 §2), `AppProperties`
- [x] `frontend/` altında Angular 22 workspace (06 §1), proxy, wasm asset kopyası
- [x] `frontend-maven-plugin` + kaynak kopyalama (05 §1.2), `-Pno-frontend` profili
- [x] `SpaWebConfig`, MIME `.wasm`, güvenlik başlıkları iskeleti, `TimeController` (`/api/public/time`)
- [x] Geçici `HomeComponent` ("Yoklama") ve `/actuator/health`

**Kabul:** `./mvnw verify` başarılı; `java -jar target/yoklama-*.jar` → `http://localhost:8080/` Angular sayfası, `/t/abc` derin bağlantısı index.html döner, `/api/public/time` JSON döner, `/zxing/*.wasm` `application/wasm` ile sunulur.

## Faz 1 — Protokol çekirdeği
- [x] Java: `Base32`, `Base36`, `Hmac`, `SessionKeyDerivation`, `QrToken`, `QrTokenCodec`, `BleChallenge` (05 §8)
- [x] Java testleri: 02'deki **tüm** vektörler + 10 §1 crypto satırları
- [x] TS: `core/token-codec.ts` (06 §5.1) + Vitest vektör testleri
- [x] `MasterSecretConfig` (prod'da zorunlu, dev'de rastgele + WARN)

**Kabul:** İki dilde de T-1/T-2/T-3, KD-1, B-1 ve base32 vektörleri birebir geçer.

## Faz 2 — Veri modeli
- [x] `V1__init.sql` (03 §4), tüm entity'ler, enum'lar, `FlagSetConverter`, repository'ler
- [x] `AdminBootstrap`
- [x] `ddl-auto=validate` ile hem H2 dev hem test profilinde açılış

**Kabul:** Uygulama temiz veritabanıyla açılır, admin oluşur; repository smoke testleri geçer. (Opsiyonel: Testcontainers PostgreSQL ile migration testi.)

## Faz 3 — Kimlik doğrulama ve öğretim üyesi API'leri
- [x] `SecurityConfig` (05 §4), `AuthController` (`csrf`, `login`, `logout`, `me`), `GlobalExceptionHandler`, `ErrorCode`
- [x] Admin: öğretim üyesi CRUD
- [x] Dersler + roster (CRUD, CSV içe aktarma)
- [x] Derslikler + BLE anahtar üretimi
- [x] Oturumlar: oluştur, aç, uzat, kapat, sil, liste, detay, display-config; `SessionCodeGenerator`; `SessionAutoCloseJob`
- [x] Sahiplik kontrolleri
- [x] Entegrasyon testleri: 10 §2 senaryo 1, 13

**Kabul:** Tüm uç noktalar 04'teki şemalarla çalışır; CSRF ve sahiplik testleri geçer.

## Faz 4 — Öğretim üyesi arayüz kabuğu
- [x] Tasarım tokenları, temel UI bileşenleri (button, card, badge, dialog, table stilleri), `messages.ts`
- [x] `ApiService`, `api-error.interceptor`, `AuthService`, `authGuard`, `adminGuard`
- [x] Giriş, dersler, ders detayı (roster tablosu + CSV içe aktarma), derslikler (konumumu kullan, BLE anahtar dialog'u), oturum oluşturma formu, oturum listesi, admin öğretim üyeleri

**Kabul:** Tarayıcıda giriş yapılıp ders/roster/derslik/oturum oluşturulabilir, oturum açılabilir.

## Faz 5 — Display (projeksiyon)
- [x] `ClockSyncService` (06 §5.2) + testleri
- [x] `DisplayComponent`: display-config, anahtar içe aktarma, ön-hazırlıklı token/QR döngüsü (02 §4, 06 §7.1), `fillRect` ile tam sayı modül çizimi, ilerleme çubuğu, katılım paneli (kod, adres, küçük statik QR), wake lock, tam ekran, debug katmanı, 60 sn'de yeniden senkron, başlıyor/kapandı durumları
- [x] `slotAt` saf fonksiyonu + testi

**Kabul:** Display her `refreshMs`'de yeni QR gösterir; QR'ı herhangi bir okuyucuyla okutunca 02 §3 formatında, sunucunun doğrulayacağı token çıkar (Faz 6 testinde display'in ürettiği bir token sunucu tarafından doğrulanarak teyit edilir). QR sürüm 2 (25×25).

## Faz 6 — Öğrenci check-in backend'i
- [x] `DeviceCookieFilter`, `RateLimitFilter`
- [x] `PublicSessionController` (`GET /api/public/sessions/{code}`)
- [x] `CheckinService`: start, sync, scans (`ScanValidator`), frame, ble-nonce, ble, complete
- [x] `DecisionEngine` + `GeoMath` (07) + kapsamlı birim testleri
- [x] `FrameStorage` (dosya sistemi)
- [x] `SseHub` + `LiveEventPublisher` + `GET /api/sessions/{id}/events`
- [x] `AttemptExpiryJob`
- [x] Entegrasyon testleri: 10 §2 senaryo 2–11

**Kabul:** Tüm öğrenci uç noktaları 04 §2'ye uygun; karar motoru testleri geçer; SSE olayları commit sonrası yayınlanır.

## Faz 7 — Öğrenci tarayıcı arayüzü
- [x] `camera.ts`, `frame-loop.ts`, `decoder.worker.ts`, `decoder-client.ts`, `ScannerEngine` (06 §5.3–5.5) + testler
- [x] Konum toplama (06 §5.6)
- [x] `CheckinFlowComponent` tüm durumlar (06 §6), BLE adımı (özellik tespitiyle), hata ekranları, kamera izni yardım metinleri
- [x] `HomeComponent`: kod girişi

**Kabul:** Masaüstü Chrome'da `localhost`'tan, yan pencerede açık display'i webcam ile okutarak uçtan uca check-in tamamlanır (`ACCEPTED`). Telefonda HTTPS tüneliyle aynı akış çalışır (09 §4).

## Faz 8 — Canlı dashboard
- [x] `AttendanceService`, `AttendanceController` (liste, karar, manuel, sil, kare, reddedilen denemeler)
- [x] `CsvExportService` + uç nokta
- [x] `SseService` (06 §5.7)
- [x] `SessionDashboardComponent` (06 §7.2): üst bar, sayaçlar, tablo, filtreler, detay paneli + kare, karar butonları, manuel ekleme, reddedilen denemeler sekmesi, CSV indirme

**Kabul:** Check-in yapıldığında satır < 1 sn içinde dashboard'da belirir; karar değişiklikleri anında yansır; CSV Excel'de Türkçe karakterlerle doğru açılır.

## Faz 9 — Kalibrasyon
- [x] `CalibrationService` + uç noktalar (04 §4.5) + baseline hesabı (07 §5)
- [x] `POST /api/sessions/{id}/reevaluate`
- [x] `CalibrateComponent` (06 §7.3); dashboard'da kalibrasyon QR dialog'u ve eşik gösterimi, "yeniden değerlendir" butonu

**Kabul:** Üç kalibrasyon turundan sonra eşik `CALIBRATED` olur; yeni check-in'ler bu eşikle değerlendirilir.

## Faz 10 — BLE beacon
- [x] `firmware/ble-beacon/` (08 §3) + README
- [x] Öğrenci BLE adımının uçtan uca doğrulanması (gerçek kart yoksa: birim testleri + nRF Connect ile manuel test talimatı DECISIONS.md'ye)

**Kabul:** Firmware derlenir (Arduino CLI ile `arduino-cli compile --fqbn esp32:esp32:esp32` mümkünse); B-1 vektörü kartta doğrulanır.

## Faz 11 — Sertleştirme ve teslim
- [x] `FrameRetentionJob` ve deneme temizliği (05 §9.6)
- [x] Güvenlik başlıkları ve CSP'nin son hali; CSP ile wasm/worker'ın çalıştığının doğrulanması
- [x] Erişilebilirlik ve mobil düzen kontrolü (320 px genişlik)
- [x] `deploy/` dosyaları (09 §2), `.dockerignore`, `docker compose up` ile çalıştırma
- [x] README'nin "Hızlı başlangıç" ve "Üretim" bölümleri
- [x] 10 §4 manuel test listesinin README'ye kopyalanması (işaretlenecek şekilde)

**Kabul:** `docker compose up` ile HTTPS altında tüm akış çalışır; `./mvnw verify` ve `npm test` yeşil.
