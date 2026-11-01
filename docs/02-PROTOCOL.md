# 02 — Protokol

Bu doküman **normatiftir**. Java ve TypeScript uygulamaları buradaki test vektörlerini birim testlerinde birebir doğrulamak zorundadır. Protokolde değişiklik gerekiyorsa önce bu doküman ve vektörler güncellenir.

## 1. Kodlamalar

### 1.1 Base36
- Alfabe: `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ` (yalnızca büyük harf).
- Negatif olmayan tam sayı → en kısa gösterim, baştaki sıfır yok; `0` → `"0"`.
- Çözümleme büyük/küçük harf duyarlıdır (yalnızca büyük harf kabul edilir).
- Java: `Long.toString(n, 36).toUpperCase(Locale.ROOT)` / `Long.parseLong(s, 36)` kullanılabilir (girdiyi önce `^[0-9A-Z]+$` ile doğrulayın).
- TS: `n.toString(36).toUpperCase()` — `ts` değerleri `Number.MAX_SAFE_INTEGER` altında kalır, `number` yeterli.

### 1.2 Base32
- RFC 4648, alfabe `ABCDEFGHIJKLMNOPQRSTUVWXYZ234567`, **padding yok**.
- Vektör: bytes `00 11 22 33 44 55 66 77` → `AAISEM2EKVTHO`
- JDK'da yok; küçük bir yardımcı sınıf yazın (commons-codec kullanılmayacak). TS'de de elle yazın.

### 1.3 Oturum kodu (`CODE`)
- 6 karakter, alfabe: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (0/O/1/I yok).
- `SecureRandom` ile üretilir; OPEN veya DRAFT durumundaki oturumlar arasında benzersiz olmalı (çakışmada tekrar üret).

## 2. Anahtarlar

### 2.1 Ana gizli anahtar (`masterSecret`)
- 32 bayt rastgele, base64 olarak `app.master-secret` (`APP_MASTER_SECRET`) ile verilir.
- `prod` profilinde yoksa uygulama **başlamaz**. `dev` profilinde yoksa rastgele üretilir ve WARN loglanır (yeniden başlatmada açık oturumların tokenları geçersiz olur — dev'de kabul).

### 2.2 Oturum anahtarı
```
sessionKey = HMAC-SHA256(masterSecret, ASCII("Y1-SESSION|" + sessionId + "|" + code))   // 32 bayt
```
- `sessionId` ondalık gösterimdir (ör. `42`).
- Veritabanında saklanmaz; ihtiyaç anında türetilir.
- Yalnızca `GET /api/sessions/{id}/display-config` ile oturum sahibine base64 olarak verilir.

**Vektör (KD-1):** `masterSecret = 00 01 02 … 1f` (32 bayt), `sessionId = 42`, `code = ABC234`
```
sessionKey (hex)    = f03322a3f7b40ac4ae6815c92a6404daeea905c08cd225d2fc2d151f3ff417ae
sessionKey (base64) = 8DMio/e0CsSuaBXJKmQE2u6pBcCM0iXS/C0VHz/0F64=
```

## 3. QR token

### 3.1 Format
```
prefix = "Y1." + CODE + "." + base36(seq) + "." + base36(ts)
sig    = base32( HMAC-SHA256(sessionKey, ASCII(prefix))[0..8) )      // ilk 8 bayt → 13 karakter
token  = prefix + "." + sig
```
- `seq`: slot numarası, `0 ≤ seq ≤ 1 679 615` (base36'da en fazla 4 karakter).
- `ts`: slotun **planlı** gösterim anı, Unix epoch milisaniye: `ts = epochStartMs + seq * refreshMs`.
- Regex: `^Y1\.([A-HJ-NP-Z2-9]{6})\.([0-9A-Z]{1,4})\.([0-9A-Z]{1,9})\.([A-Z2-7]{13})$`
- En fazla 37 karakter; yalnızca QR alfanümerik mod karakterleri → **QR sürüm 2, ECC M, 25×25 modül** (doğrulandı). QR üretilirken ECC yükseltme (boost) kapalı olmalı, mod otomatik/alfanümerik.
- İmza karşılaştırması **sabit zamanlı** (`MessageDigest.isEqual`) yapılır.

### 3.2 Test vektörleri

Anahtar: `sessionKey = 00 01 02 … 1f` (32 bayt, doğrudan; türetme yok)

| # | CODE | seq | ts | prefix | token |
|---|---|---|---|---|---|
| T-1 | ABC234 | 7 | 1760000000000 | `Y1.ABC234.7.MGJ6K3CW` | `Y1.ABC234.7.MGJ6K3CW.77B7SI2E54AA2` |
| T-2 | K7Q2ZP | 1295 | 1760000001500 | `Y1.K7Q2ZP.ZZ.MGJ6K4IK` | `Y1.K7Q2ZP.ZZ.MGJ6K4IK.NNSGYSRVIIHIU` |
| T-3 | ABC234 | 0 | 1760000000000 | `Y1.ABC234.0.MGJ6K3CW` | `Y1.ABC234.0.MGJ6K3CW.SGERQ6UXA4VUK` |

T-1 tam HMAC (hex): `ffc3f92344ef000dc46db591f4b5583f5cc46bd7224a91b0717261c73b6d669e`

Uçtan uca vektör (KD-1 anahtarıyla): `CODE=ABC234, seq=7, ts=1760000000000` → `Y1.ABC234.7.MGJ6K3CW.5II22G743573Q`

Negatif vektörler (doğrulama başarısız olmalı):
- T-1'in son karakteri değiştirilmiş: `Y1.ABC234.7.MGJ6K3CW.77B7SI2E54AA3` → `TOKEN_INVALID`
- Küçük harf: `y1.abc234.7.mgj6k3cw.77b7si2e54aa2` → `TOKEN_INVALID` (format)
- Kod alfabesi dışı (`1` ve `O` alfabede yok): `Y1.ABC1O3.7.MGJ6K3CW.77B7SI2E54AA2` → `TOKEN_INVALID` (format)

## 4. Display zaman çizelgesi

- Oturum açılırken: `epochStartMs = ceil(now / 1000) * 1000`, `closesAt = openedAt + durationMinutes`.
- Slot `k`: planlı başlangıç `T_k = epochStartMs + k * refreshMs`, `seq = k`, `ts = T_k`.
- Display, slot `k` gösterilirken `k+1` için tokenı imzalar ve QR'ı offscreen canvas'a çizer (WebCrypto asenkron olduğu için **önceden hazırlama zorunlu**).
- `requestAnimationFrame` döngüsünde `syncedNow() ≥ T_k` olan ilk karede hazır canvas görünür canvas'a kopyalanır. Böylece gerçek gösterim `T_k`'dan en fazla 1 ekran karesi (~16 ms) sonra olur; bu sabit sapma kalibrasyonla emilir.
- Hazır değilse (gecikme) o anda üretilir ve display'in debug sayacında `lateFrames++`.
- `syncedNow() < epochStartMs` iken "Başlıyor…" gösterilir. `syncedNow() ≥ closesAt` ise "Yoklama kapandı" gösterilir.

## 5. Saat senkronu (istemci ↔ sunucu)

`GET /api/public/time` → `{"serverTime": <epoch ms>}` (`Cache-Control: no-store`; değer yanıt yazılmadan hemen önce alınır).

İstemci algoritması:
```
samples = []
repeat N=8 times (ardışık, aralarında bekleme yok):
    t0 = performance.timeOrigin + performance.now()
    s  = await fetch('/api/public/time', {cache:'no-store'}).json().serverTime
    t1 = performance.timeOrigin + performance.now()
    samples.push({ rtt: t1 - t0, offset: s - (t0 + t1) / 2 })
best = samples with minimum rtt
offsetMs = best.offset;  rttMs = best.rtt
syncedNow() = performance.timeOrigin + performance.now() + offsetMs
```
- `Date.now()` hiçbir hesapta kullanılmaz.
- Display: sayfa açılışında + her 60 sn'de bir yeniden senkron.
- Öğrenci: tarama başlamadan önce bir kez (`sync1`), tamamlamadan önce bir kez (`sync2`); ikisi de sunucuya raporlanır. `|sync2.offset − sync1.offset| > 100 ms` ise sunucu `CLOCK_INCONSISTENT` bayrağı koyabilir.

## 6. Kare zamanı ve optik gecikme

Öğrenci tarafında kare döngüsü `HTMLVideoElement.requestVideoFrameCallback` ile çalışır (yoksa `requestAnimationFrame` + `video.currentTime` değişimi).

```
onFrame(now, metadata):
    if metadata?.captureTime is number:
        perfT = metadata.captureTime;  source = 'captureTime'
    else:
        perfT = now;                   source = 'callback'      // rAF yedeğinde 'raf'
    frameServerMs = performance.timeOrigin + perfT + offsetMs
```

- Kare çözülmek üzere Worker'a gönderilirken `frameServerMs` ile birlikte gönderilir. Worker meşgulken gelen kareler atlanır.
- Çözülen token **yeni bir `seq`** ise: `firstSeenServerMs = frameServerMs` (çözme işleminin bittiği an değil, karenin zamanı).
- Sunucu: `latencySampleMs = firstSeenServerMs − ts`.
- Örnekleme nedeniyle ilk görülme bir çözme döngüsü kadar gecikebilir; bu yüzden **deneme içindeki en küçük örnek** (`minLatencyMs`) kullanılır.

Beklenen değerler (kalibrasyonla doğrulanacak): doğrudan okuma ~100–250 ms; görüntülü arama ile aktarım ~350–800 ms.

## 7. Tarama doğrulama kuralları (sunucu, her `POST .../scans` için)

`arrivalMs` = sunucunun isteği aldığı an.

| Kontrol | Başarısızlıkta |
|---|---|
| Format/regex | scan `valid=false`, `reason=TOKEN_INVALID` |
| `CODE` = deneme oturumunun kodu | `TOKEN_INVALID` |
| HMAC (sabit zamanlı) | `TOKEN_INVALID` |
| `ts == epochStartMs + seq*refreshMs` | `TOKEN_INVALID` |
| `epochStartMs ≤ ts < closesAt` | `TOKEN_INVALID` |
| `arrivalMs − ts ≤ maxTokenAgeMs` (varsayılan 4000) | `TOKEN_EXPIRED` |
| `ts ≤ arrivalMs + 1000` (gelecekten token yok) | `TOKEN_INVALID` |
| `firstSeenServerMs ≤ arrivalMs + 500` | scan geçerli ama `clockSuspect=true` |
| `firstSeenServerMs − ts ≥ −150` | değilse scan geçerli ama `clockSuspect=true` |
| Aynı `seq` bu denemede zaten geçerli | yok sayılır (idempotent), `duplicate=true` |

Geçersiz taramalar da kaydedilir (inceleme için), ama sayıma girmez.

### 7.1 Tamamlama koşulu
Geçerli taramaların farklı `seq` değerleri sıralanır; uzunluğu `maxSpanSlots` (varsayılan 6) olan herhangi bir pencerede en az `requiredScans` (varsayılan 3) farklı `seq` bulunmalıdır:
```
exists i: count(seqs in [s_i, s_i + maxSpanSlots − 1]) ≥ requiredScans
```
Sağlanmazsa `complete` → `NOT_ENOUGH_SCANS`.

## 8. Alan oranı (ekrandan okuma sezgisi)

Worker, zxing sonucundaki dört köşe noktasını (`topLeft, topRight, bottomRight, bottomLeft`, çözme görüntüsü koordinatlarında) döner. İstemci bunları ve çözme görüntüsünün `frameW, frameH` boyutunu gönderir.

```
areaRatio = shoelaceArea(corners) / (frameW * frameH)
```
Sunucu hesaplar; deneme içindeki **en büyük** değer `areaRatioMax`. Projeksiyondan uzaktan okumada tipik olarak küçüktür; yakındaki bir ekrandan okumada büyüktür. Eşik kalibrasyondan veya varsayılandan gelir (bkz. 07).

## 9. Cihaz kimliği

- **`YD` çerezi:** Sunucu, `/api/public/**` isteklerinde yoksa üretir: 16 rastgele bayt → base32 (26 karakter). `HttpOnly; Secure (prod); SameSite=Lax; Path=/; Max-Age=400 gün`.
- **Kamera kimliği:** İstemci `track.getSettings().deviceId` değerinin SHA-256 hex özetini `cameraIdHash` olarak gönderir (değer origin'e özgü ve rastgeledir; özet yalnızca uzunluk normalizasyonu içindir).
- Oturum başına: aynı `YD` ile ikinci başarılı kayıt yapılamaz (`DEVICE_ALREADY_USED`). Aynı `cameraIdHash` başka öğrenci numarasıyla görülürse `CAMERA_REUSED` bayrağı.

## 10. BLE challenge-response

### 10.1 GATT tanımı (varsayılanlar `app.ble.*` ile değiştirilebilir)

| Öğe | UUID | Özellik |
|---|---|---|
| Servis | `8f3a0001-5c2e-4b7a-9d61-3e0f7a2b9c10` | Yayın paketinde (advertising) yer alır |
| Nonce | `8f3a0002-5c2e-4b7a-9d61-3e0f7a2b9c10` | write (with response) |
| Yanıt | `8f3a0003-5c2e-4b7a-9d61-3e0f7a2b9c10` | read |

Cihaz adı: `YKL-<beaconId>` (ör. `YKL-101`), kısa tutulur (yayın paketi 31 bayt).

### 10.2 Akış
1. İstemci `POST /api/public/checkins/{attemptId}/ble-nonce` → `{nonce, …}`. `nonce`: 16 karakter, base32 alfabesinden rastgele; 60 sn geçerli, tek kullanımlık, denemeye bağlı.
2. İstemci beacon'a bağlanır, `nonce`'u ASCII olarak Nonce karakteristiğine yazar, Yanıt karakteristiğini okur.
3. Beacon: `response = HEX_UPPER( HMAC-SHA256(bleKey, ASCII(nonce))[0..8) )` (16 karakter). Yanıt **bağlantı bazında** saklanır (eşzamanlı bağlantılarda karışmaması için).
4. İstemci `POST /api/public/checkins/{attemptId}/ble` `{response}`; sunucu aynı hesabı dersliğin `bleKey`'i ile yapar.

`bleKey`: 32 bayt, derslik başına; sunucu üretir; firmware'e hex olarak gömülür.

**Vektör (B-1):** `bleKey = 20 21 22 … 3f` (32 bayt), `nonce = N7F3K9QZ2M4XW8TA` → `response = C96FAE95628876C7`
