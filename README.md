# Yoklama — Dönen QR ile Sınıf Yoklama Sistemi

Projeksiyona yansıtılan, saniyede değişen QR kodlarını öğrencilerin telefonlarıyla okutarak sınıf yoklaması alan web tabanlı bir uygulama.

## Mimari

- **Backend:** Spring Boot 4.1 (Java 21) — REST API, HMAC-SHA256 token doğrulama, karar motoru
- **Frontend:** Angular 22 — standalone, zoneless, signals; zxing-wasm ile QR çözümleme
- **Veritabanı:** PostgreSQL (geliştirmede H2 PostgreSQL modunda)
- **BLE Beacon:** ESP32 (NimBLE) — isteğe bağlı Bluetooth yakınlık doğrulaması

## Hızlı Başlangıç (Geliştirme)

### Gereksinimler
- JDK 21+
- Node.js 24.15+ veya 26+
- Maven (wrapper dahil)

### Çalıştırma

```bash
# Backend (dev profiliyle H2 veritabanı, otomatik admin kullanıcısı admin/admin123)
./mvnw -Pno-frontend spring-boot:run

# Frontend (ayrı terminalde, API proxy 8080'e)
cd frontend && npm start
```

Tarayıcıda `http://localhost:4200` adresini açın.

### Test

```bash
# Tüm testler (backend + frontend build + test)
./mvnw verify

# Yalnızca backend
./mvnw -Pno-frontend test

# Yalnızca frontend
cd frontend && npm test -- --watch=false
```

## Üretim (Docker Compose)

```bash
cd deploy
cp .env.example .env
# .env dosyasını düzenleyin (DOMAIN, DB_PASSWORD, APP_MASTER_SECRET, APP_ADMIN_PASSWORD)

# Önce JAR oluşturun
cd .. && ./mvnw clean package -DskipTests
cd deploy

# Çalıştırın
docker compose up -d
```

Caddy, `DOMAIN` için otomatik HTTPS sertifikası alır ve `https://<DOMAIN>` adresinden yayın yapar (SSE tamponlaması kapalı).
Uygulamaya doğrudan erişim yalnızca sunucunun kendisinden `http://127.0.0.1:8080` ile mümkündür; PostgreSQL dışarı açılmaz.
`DB_PASSWORD`, `APP_MASTER_SECRET` ve `APP_ADMIN_PASSWORD` boşsa compose başlamaz.

### Ortam Değişkenleri

| Değişken | Açıklama |
|---|---|
| `DOMAIN` | Caddy'nin HTTPS sertifikası alacağı alan adı |
| `APP_MASTER_SECRET` | 32-byte base64 kodlanmış ana anahtar (zorunlu, `openssl rand -base64 32`) |
| `APP_PUBLIC_BASE_URL` | Herkese açık URL (QR içindeki katılım adresi) |
| `APP_ADMIN_USERNAME` | İlk admin kullanıcı adı |
| `APP_ADMIN_PASSWORD` | İlk admin şifresi |
| `APP_FRAMES_DIR` | Kamera karesi depolama dizini (varsayılan: `./data/frames`) |
| `TZ` | CSV'deki saatlerin saat dilimi (compose varsayılanı `Europe/Istanbul`) |

## Kullanım Akışı

### Öğretim Üyesi
1. `/t/login` adresinden giriş yapın
2. Ders ve öğrenci listesi (roster) oluşturun
3. Derslik ekleyin (isteğe bağlı: konum, BLE beacon)
4. Oturum oluşturup "Başlat" ile açın
5. "Display" butonuyla projeksiyon penceresini açın
6. Dashboard'dan canlı katılımı takip edin, şüpheli kayıtları değerlendirin

### Öğrenci
1. Ana sayfadan 6 haneli katılım kodunu girin
2. Öğrenci numaranızı girin
3. "Kamerayı başlat" ile projeksiyondaki QR kodunu okutun
4. Gerekli sayıda farklı kod okunduğunda yoklama otomatik kaydedilir

## Güvenlik

- QR tokenları HMAC-SHA256 ile imzalanır; oturum anahtarı yalnızca sunucu ve display arasında paylaşılır
- İmza karşılaştırmaları sabit zamanlıdır (timing attack koruması)
- Cihaz çerezi (HttpOnly) ile tekrar kullanım kontrolü
- Herkese açık POST uç noktaları ve giriş için IP/cihaz bazlı hız sınırı (429 + `Retry-After`)
- Kamera karesi şeffaf şekilde toplanır, 7 gün sonra otomatik silinir
- Karar motoru yalnızca bayrak koyar; nihai karar öğretim üyesindedir
- Öğrenciye hiçbir yanıtta bayraklar, gecikme değerleri veya eşikler gönderilmez

## Manuel Test Listesi

- [ ] Tarayıcıda giriş yapılıp ders/roster/derslik/oturum oluşturulabilir
- [ ] Oturum açılabilir ve display QR gösterir
- [ ] Display'deki QR her `refreshMs`'de değişir
- [ ] Öğrenci ana sayfadan kod girip check-in başlatabilir
- [ ] Kamera ile QR okutulup yoklama alınır (ACCEPTED)
- [ ] Dashboard'da katılım < 1 sn içinde belirir
- [ ] Aynı öğrenci numarası ile ikinci deneme ALREADY_CHECKED_IN verir
- [ ] Aynı cihazdan ikinci deneme DEVICE_ALREADY_USED verir
- [ ] Roster'da olmayan öğrenci NOT_IN_ROSTER alır (requireRoster=true)
- [ ] Oturum kapandıktan sonra check-in SESSION_NOT_OPEN verir
- [ ] CSV indirme Türkçe karakterlerle doğru açılır (Excel, BOM + `;` ayırıcı)
- [ ] Manuel katılım ekleme ve silme çalışır
- [ ] Kalibrasyon turu sonrası eşik CALIBRATED olur
- [ ] Karar (Onayla/Reddet) anında yansır
- [ ] SSE yeniden bağlanma sonrası liste tazelenir
- [ ] Display tam ekran ve 'd' tuşu ile debug katmanı çalışır
- [ ] Kamera izni reddi durumunda uygun hata mesajı gösterilir
- [ ] 320px genişlikte yatay kaydırma oluşmaz (mobil)
