# 07 — Karar Motoru

`complete` çağrısında `DecisionEngine.evaluate(attempt, scans, completeRequest, session, classroom)` çalışır ve ya **kesin red** (exception → hata kodu) ya da `Decision{status, flags, metrics}` döner. Saf fonksiyon olarak yazılmalı (veritabanına erişmez; girdiler hazırlanıp verilir) ve kapsamlı birim testine sahip olmalıdır.

## 1. Kesin red (öğrenciye hata döner, `attendance` oluşmaz)

Sırasıyla kontrol edilir:

| # | Koşul | Kod |
|---|---|---|
| H1 | Oturum OPEN değil veya `now ≥ closesAt` | `SESSION_NOT_OPEN` |
| H2 | Deneme `SCANNING` değil veya `now > expiresAt` | `ATTEMPT_EXPIRED` |
| H3 | Tamamlama koşulu (02 §7.1) sağlanmıyor | `NOT_ENOUGH_SCANS` |
| H4 | Bu oturumda aynı `studentNo` ile `attendance` var | `ALREADY_CHECKED_IN` |
| H5 | Bu oturumda aynı `deviceId` ile `attendance` var | `DEVICE_ALREADY_USED` |

Red durumunda deneme `REJECTED` + `resultCode` olarak kaydedilir ve SSE `attempt-rejected` yayınlanır.

## 2. Metrikler

| Metrik | Hesap |
|---|---|
| `minLatencyMs` | Geçerli taramalarda `min(firstSeenServerMs − ts)`; `clockSuspect` olan taramalar hariç (hepsi suspect ise hepsi dahil) |
| `areaRatioMax` | Geçerli taramalarda `max(areaRatio)` |
| `latencyThresholdMs`, `thresholdSource` | Oturumda `baselineLatencyMs` varsa `baseline + latencyMarginMs` → `CALIBRATED`; yoksa `defaultLatencyThresholdMs` → `DEFAULT` |
| `areaThreshold` | `baselineAreaRatioMax` varsa `max(baselineAreaRatioMax × 2.0, 0.10)`; yoksa `screenAreaRatioThreshold` (varsayılan 0.25) |
| `geoDistanceM` | Dersliğin merkezine haversine mesafesi |
| Saat | `sync1` (deneme), `sync2` (complete) |

## 3. Yumuşak bayraklar (kayıt `FLAGGED` olur)

| Bayrak | Koşul | Dashboard açıklaması (TR) |
|---|---|---|
| `LATENCY_HIGH` | `minLatencyMs > latencyThresholdMs` | Optik gecikme eşiğin üzerinde (olası canlı aktarım) |
| `SCREEN_SUSPECT` | `areaRatioMax > areaThreshold` | QR karede çok büyük (olası ekrandan okuma) |
| `NO_FRAME` | `frameCapture` açık ve kare yüklenmemiş | Kamera karesi yüklenmedi |
| `CLOCK_POOR` | `max(sync1.rtt, sync2.rtt) > maxClockRttMs` (800) | Saat senkronu zayıf, gecikme ölçümü güvenilmez |
| `CLOCK_INCONSISTENT` | `|sync2.offset − sync1.offset| > 100` veya geçerli taramaların yarısından fazlası `clockSuspect` | Saat tutarsız |
| `GEO_OUTSIDE` | `geoMode=FLAG`, konum var, `geoDistanceM − accuracyM > radiusM` | Derslik alanı dışında |
| `GEO_LOW_ACCURACY` | `geoMode=FLAG`, konum var, `accuracyM > maxGeoAccuracyM` (150) | Konum doğruluğu düşük |
| `GEO_UNAVAILABLE` | `geoMode=FLAG`, `geo.state ∈ {DENIED, UNSUPPORTED, TIMEOUT}` | Konum alınamadı |
| `CAMERA_REUSED` | Aynı oturumda aynı `cameraIdHash` başka bir `studentNo`'lu `attendance`'ta var | Aynı kamera başka öğrencide kullanılmış |

### 3.1 BLE etkisi
`bleVerified == true` ise ve `app.checkin.ble-clears-latency=true` (varsayılan) ise `LATENCY_HIGH` ve `SCREEN_SUSPECT` bayrakları **eklenmez** (BLE yakınlığı kanıtladı); metrikler yine kaydedilir. BLE başarısızlığı bayrak üretmez.

### 3.2 Sonuç
```
status = flags.isEmpty() ? ACCEPTED : FLAGGED
```
Öğrenciye her iki durumda da `RECORDED` döner.

## 4. Geo yardımcıları
- Konum istemcide en fazla 10 sn `watchPosition` ile toplanır, en iyi doğruluk gönderilir (06'ya bakın).
- `geo_state` alanı: `OFF` (mod kapalı), `OK`, `OUTSIDE`, `LOW_ACCURACY`, `UNAVAILABLE` — birden fazla geo bayrağı varsa öncelik `OUTSIDE > LOW_ACCURACY`.

## 5. Kalibrasyon hesabı
Her `CalibrationRun`: geçerli taramalardan `minLatencyMs` ve `maxAreaRatio`.
Oturum:
```
baselineLatencyMs   = median(runs.minLatencyMs)          // en az 1 tur
baselineAreaRatioMax = max(runs.maxAreaRatio)
```
Tur eklenince/silinince yeniden hesaplanır. Kalibrasyondan **önce** kaydedilmiş yoklamalar yeniden değerlendirilmez (dashboard'da "Eşik: varsayılan" etiketi görünür). Opsiyonel: dashboard'da "Kalibrasyona göre yeniden değerlendir" butonu → `POST /api/sessions/{id}/reevaluate` (yalnızca latency/area bayraklarını yeniden hesaplar; öğretim üyesi kararlarına dokunmaz). Bu uç nokta Faz 9'da uygulanır.

## 6. Konfigürasyon (`app.checkin.*`)

| Anahtar | Varsayılan |
|---|---|
| `defaults.refresh-ms` | 1000 |
| `defaults.required-scans` | 3 |
| `defaults.max-span-slots` | 6 |
| `defaults.max-token-age-ms` | 4000 |
| `defaults.latency-margin-ms` | 150 |
| `defaults.default-latency-threshold-ms` | 450 |
| `defaults.screen-area-ratio-threshold` | 0.25 |
| `defaults.duration-minutes` | 10 |
| `defaults.geo-mode` | OFF |
| `defaults.ble-mode` | OFF |
| `defaults.frame-capture` | true |
| `defaults.require-roster` | true |
| `max-clock-rtt-ms` | 800 |
| `max-geo-accuracy-m` | 150 |
| `ble-clears-latency` | true |
| `attempt-ttl-seconds` | 180 |
| `student-no-pattern` | `^[0-9]{5,12}$` |
| `max-scans-per-attempt` | 60 |
