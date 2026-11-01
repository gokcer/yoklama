# 04 — API

## 1. Genel
- Taban: `/api`. JSON, UTF-8. Zamanlar ISO-8601 (`Instant`) veya açıkça `...Ms` ile biten alanlarda epoch ms.
- Öğretim üyesi uç noktaları oturum çerezi (`JSESSIONID`) + CSRF (`XSRF-TOKEN` çerezi → `X-XSRF-TOKEN` başlığı) ister.
- `/api/public/**` kimlik doğrulama ve CSRF gerektirmez; `YD` cihaz çerezi bu uç noktalarda atanır.
- Hata gövdesi (her zaman):
```json
{ "code": "SESSION_NOT_OPEN", "message": "Bu yoklama şu anda açık değil.", "details": {} }
```

### 1.1 Hata kodları

| Kod | HTTP | Öğrenciye mesaj (TR) |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Girilen bilgiler geçersiz. |
| `UNAUTHORIZED` | 401 | — |
| `FORBIDDEN` | 403 | — |
| `NOT_FOUND` | 404 | — |
| `SESSION_NOT_FOUND` | 404 | Yoklama bulunamadı. Kodu kontrol edin. |
| `SESSION_NOT_OPEN` | 409 | Bu yoklama şu anda açık değil. |
| `NOT_IN_ROSTER` | 409 | Bu öğrenci numarası dersin listesinde yok. |
| `ALREADY_CHECKED_IN` | 409 | Bu öğrenci numarası için yoklama zaten alınmış. |
| `DEVICE_ALREADY_USED` | 409 | Bu cihazdan bu yoklama için zaten kayıt yapılmış. |
| `ATTEMPT_NOT_FOUND` | 404 | Oturumunuz bulunamadı, baştan başlayın. |
| `ATTEMPT_EXPIRED` | 410 | Süre doldu, lütfen tekrar deneyin. |
| `NOT_ENOUGH_SCANS` | 409 | QR okutma tamamlanmadı, tekrar deneyin. |
| `BLE_NONCE_EXPIRED` | 410 | Bluetooth doğrulaması zaman aşımına uğradı. |
| `RATE_LIMITED` | 429 | Çok fazla deneme. Biraz bekleyin. |
| `FRAME_INVALID` | 400 | — |
| `CONFLICT` | 409 | — |

`message` alanı her zaman Türkçe, kullanıcıya gösterilebilir metindir.

## 2. Herkese açık uç noktalar (`/api/public`)

### `GET /api/public/time`
```json
{ "serverTime": 1760000000123 }
```
`Cache-Control: no-store`. Rate limit yok.

### `GET /api/public/sessions/{code}`
Kod büyük harfe çevrilip aranır.
```json
{
  "code": "ABC234",
  "courseCode": "CENG101",
  "courseName": "Introduction to Computer Engineering",
  "title": "Hafta 5",
  "status": "OPEN",
  "closesAt": "2026-10-20T09:40:00Z",
  "refreshMs": 1000,
  "requiredScans": 3,
  "geoMode": "FLAG",
  "bleMode": "OPTIONAL",
  "frameCapture": true,
  "privacyNotice": "Doğrulama amacıyla, QR okutulduğu andaki kamera görüntüsü kaydedilir ve 7 gün sonra otomatik silinir.",
  "studentNoPattern": "^[0-9]{5,12}$"
}
```
Hatalar: `SESSION_NOT_FOUND`. `DRAFT` ise `SESSION_NOT_FOUND`; `CLOSED` ise status döner (istemci "kapandı" gösterir).

### `POST /api/public/checkins`
```json
// istek
{ "sessionCode": "ABC234", "studentNo": "220201001",
  "client": { "userAgent": "...", "platform": "iOS", "screenW": 390, "screenH": 844 } }
// yanıt 201
{ "attemptId": "4b0c6f0e-6d5e-4f53-9e3e-0b8a0d7d5b1a", "expiresAt": "2026-10-20T09:03:00Z",
  "studentName": "Ayşe Yılmaz" }
```
Kontroller: oturum OPEN; `studentNo` regex; `requireRoster` ise roster'da olmalı (`studentName` roster'dan, değilse `null`); aynı numarayla `attendance` varsa `ALREADY_CHECKED_IN`; aynı `YD` ile `attendance` varsa `DEVICE_ALREADY_USED`. Aynı cihazın aynı oturumdaki önceki `SCANNING` denemeleri `EXPIRED` yapılır.

### `POST /api/public/checkins/{attemptId}/sync`
Tarama öncesi senkron sonucunu bildirir (opsiyonel ama istemci her zaman gönderir).
```json
{ "offsetMs": -38, "rttMs": 92 }
```
→ `204`.

### `POST /api/public/checkins/{attemptId}/scans`
```json
// istek
{ "token": "Y1.ABC234.7.MGJ6K3CW.77B7SI2E54AA2",
  "firstSeenServerMs": 1760000000187,
  "frameTimeSource": "captureTime",
  "frameW": 960, "frameH": 540,
  "corners": [[412.5,180.0],[540.2,182.1],[538.9,309.7],[410.8,307.3]] }
// yanıt 200
{ "valid": true, "reason": null, "distinctValid": 2, "required": 3, "complete": false }
```
Deneme `SCANNING` değilse veya süresi dolmuşsa `ATTEMPT_EXPIRED`. Deneme cihaz çereziyle eşleşmeli (`YD` farklıysa `ATTEMPT_NOT_FOUND`). Tek denemede en fazla 60 tarama kaydı (fazlası `RATE_LIMITED`).

### `POST /api/public/checkins/{attemptId}/frame`
`multipart/form-data`: `frame` (image/jpeg, ≤ `app.frames.max-bytes`, varsayılan 300 KB), `seq` (int).
JPEG sihirli baytları (`FF D8 FF`) kontrol edilir. Denemede zaten kare varsa üzerine yazılmaz (`204`).
→ `204`. Hata: `FRAME_INVALID`.

### `POST /api/public/checkins/{attemptId}/ble-nonce`
Oturumun `bleMode=OPTIONAL` ve dersliğinde `bleKeyHex` olmalı; yoksa `409 CONFLICT`.
```json
{ "nonce": "N7F3K9QZ2M4XW8TA", "expiresInMs": 60000,
  "serviceUuid": "8f3a0001-5c2e-4b7a-9d61-3e0f7a2b9c10",
  "nonceCharUuid": "8f3a0002-5c2e-4b7a-9d61-3e0f7a2b9c10",
  "responseCharUuid": "8f3a0003-5c2e-4b7a-9d61-3e0f7a2b9c10",
  "beaconName": "YKL-101" }
```

### `POST /api/public/checkins/{attemptId}/ble`
```json
{ "response": "C96FAE95628876C7" }   →   { "verified": true }
```
Nonce tek kullanımlık; süresi geçmişse `BLE_NONCE_EXPIRED`.

### `POST /api/public/checkins/{attemptId}/complete`
```json
// istek
{
  "sync2": { "offsetMs": -41, "rttMs": 88 },
  "geo": { "state": "OK", "lat": 39.8912, "lng": 32.7835, "accuracyM": 24.0 },
  "camera": { "idHash": "9f2c…(64 hex)", "label": "Arka Kamera" }
}
// geo.state: "OK" | "DENIED" | "UNSUPPORTED" | "TIMEOUT" | "SKIPPED" (geoMode=OFF)
// yanıt 200 (kabul veya şüpheli — öğrenci için ayrım yok)
{ "result": "RECORDED", "studentNo": "220201001", "studentName": "Ayşe Yılmaz",
  "recordedAt": "2026-10-20T09:01:12Z" }
```
Kesin ihlalde `409` + ilgili hata kodu (`NOT_ENOUGH_SCANS`, `ALREADY_CHECKED_IN`, `DEVICE_ALREADY_USED`, `SESSION_NOT_OPEN`, `ATTEMPT_EXPIRED`).

## 3. Kimlik doğrulama (`/api/auth`)

| Yöntem | Yol | Gövde / Yanıt |
|---|---|---|
| GET | `/api/auth/csrf` | `204` — CSRF çerezinin oluşmasını garanti eder |
| POST | `/api/auth/login` | `{username, password}` → `{id, username, displayName, role}`; hatalıysa `401` |
| POST | `/api/auth/logout` | `204` |
| GET | `/api/auth/me` | `{id, username, displayName, role}` veya `401` |

## 4. Öğretim üyesi uç noktaları (kimlik doğrulamalı)

Sahiplik: öğretim üyesi yalnızca kendi ders/derslik/oturumlarını görür; `ADMIN` her şeyi görür. Aksi `403`.

### 4.1 Öğretim üyeleri (yalnızca ADMIN)
- `GET /api/admin/teachers` · `POST /api/admin/teachers` `{username, password, displayName, role}` · `PATCH /api/admin/teachers/{id}` `{displayName?, password?, enabled?}`

### 4.2 Dersler ve roster
- `GET /api/courses` → `[{id, code, name, rosterCount, createdAt}]`
- `POST /api/courses` `{code, name}` · `PUT /api/courses/{id}` · `DELETE /api/courses/{id}` (oturumu varsa `409`)
- `GET /api/courses/{id}/roster` → `[{studentNo, fullName}]`
- `POST /api/courses/{id}/roster/import?mode=REPLACE|MERGE` — `multipart` `file` (CSV). Ayırıcı `;` veya `,` otomatik; UTF-8 (BOM'lu/BOM'suz); başlık satırı opsiyonel (`studentNo;fullName` veya `ogrenciNo;adSoyad`). → `{imported, skipped, errors:[{line, message}]}`
- `POST /api/courses/{id}/roster` `{studentNo, fullName}` · `DELETE /api/courses/{id}/roster/{studentNo}`

### 4.3 Derslikler
- `GET/POST /api/classrooms`, `PUT/DELETE /api/classrooms/{id}` — `{name, latitude?, longitude?, radiusM?, bleBeaconId?}`
- `POST /api/classrooms/{id}/ble-key` → `{beaconId, keyHex}` (yeni anahtar üretir; **yalnızca bu yanıtta tam gösterilir**, listelerde `hasBleKey: true`)

### 4.4 Oturumlar
- `GET /api/sessions?courseId=&status=` → liste (özet + `attendanceCount`, `flaggedPendingCount`)
- `POST /api/sessions`
```json
{ "courseId": 3, "classroomId": 1, "title": "Hafta 5", "durationMinutes": 10,
  "refreshMs": 1000, "requiredScans": 3, "requireRoster": true,
  "geoMode": "FLAG", "bleMode": "OPTIONAL", "frameCapture": true }
```
Belirtilmeyen alanlar `app.checkin.defaults.*`'tan. Doğrulama: `refreshMs ∈ [500, 5000]`, `requiredScans ∈ [2, 6]`, `durationMinutes ∈ [1, 240]`; `geoMode=FLAG` için dersliğin koordinatları, `bleMode=OPTIONAL` için `bleKeyHex` olmalı.
- `GET /api/sessions/{id}` → tüm alanlar + `baselineLatencyMs`, `effectiveLatencyThresholdMs`, `thresholdSource`, `joinUrl`
- `POST /api/sessions/{id}/open` → `DRAFT` olmalı; `code`, `epochStartMs`, `openedAt`, `closesAt` atanır
- `POST /api/sessions/{id}/extend` `{minutes}` → `closesAt` uzatılır (OPEN)
- `POST /api/sessions/{id}/close`
- `DELETE /api/sessions/{id}` (yalnızca DRAFT)
- `GET /api/sessions/{id}/display-config`
```json
{ "sessionId": 42, "code": "ABC234", "sessionKeyB64": "…", "epochStartMs": 1760000000000,
  "refreshMs": 1000, "closesAt": "…", "joinUrl": "https://yoklama.ornek.edu.tr/c/ABC234",
  "courseCode": "CENG101", "title": "Hafta 5" }
```
Yalnızca OPEN oturumlar için ve yalnızca sahibine. Yanıt `Cache-Control: no-store`.

### 4.5 Kalibrasyon
- `POST /api/sessions/{id}/calibration-runs`
```json
{ "label": "BACK", "sync": {"offsetMs": -12, "rttMs": 70},
  "scans": [ { "token": "…", "firstSeenServerMs": 0, "frameTimeSource": "captureTime",
               "frameW": 960, "frameH": 540, "corners": [[0,0],[0,0],[0,0],[0,0]] } ] }
```
Sunucu tokenları 02 §7'ye göre doğrular (yaş kontrolü hariç değil — kalibrasyon canlı yapılır). En az `requiredScans` geçerli tarama yoksa `NOT_ENOUGH_SCANS`. → `{id, label, minLatencyMs, maxAreaRatio, validScanCount}`; oturum baseline'ı güncellenir.
- `GET /api/sessions/{id}/calibration-runs` · `DELETE /api/sessions/{id}/calibration-runs/{runId}`

### 4.6 Yoklama kayıtları
- `GET /api/sessions/{id}/attendances` → `AttendanceDto[]`:
```json
{ "id": 901, "studentNo": "220201001", "fullName": "Ayşe Yılmaz", "source": "CHECKIN",
  "status": "FLAGGED", "flags": ["LATENCY_HIGH"], "teacherDecision": "NONE", "present": false,
  "pending": true, "minLatencyMs": 512, "latencyThresholdMs": 330, "thresholdSource": "CALIBRATED",
  "areaRatioMax": 0.031, "areaThreshold": 0.25, "geoState": "OK", "geoDistanceM": 18.2,
  "geoAccuracyM": 24.0, "clockRttMs": 88, "bleVerified": false, "hasFrame": true,
  "userAgent": "…", "cameraLabel": "Arka Kamera", "teacherNote": null,
  "createdAt": "…", "decidedAt": null }
```
- `PATCH /api/sessions/{id}/attendances/{attId}` `{decision: "APPROVED"|"REJECTED"|"NONE", note?}`
- `POST /api/sessions/{id}/attendances/manual` `{studentNo, note?}` → `source=MANUAL, status=ACCEPTED, decision=APPROVED`
- `DELETE /api/sessions/{id}/attendances/{attId}` (yanlış kaydı silmek için; kare dosyası da silinir)
- `GET /api/sessions/{id}/attendances/{attId}/frame` → `image/jpeg` (`Cache-Control: private, max-age=3600`)
- `GET /api/sessions/{id}/attempts?state=REJECTED` → reddedilen denemeler (öğrenci no, sebep, zaman) — inceleme için
- `GET /api/sessions/{id}/export.csv` → `text/csv; charset=UTF-8`, BOM'lu, ayırıcı `;`. Sütunlar: `ogrenciNo;adSoyad;durum;katildi;bayraklar;gecikmeMs;esikMs;kaynak;zaman;not`. Roster varsa listede olup gelmeyenler de `durum=GELMEDI` olarak eklenir.

### 4.7 Canlı olaylar (SSE)
`GET /api/sessions/{id}/events` → `text/event-stream`
| Olay | Veri |
|---|---|
| `attendance` | `AttendanceDto` (oluşturma veya güncelleme) |
| `attendance-deleted` | `{id}` |
| `session` | `{status, closesAt, attendanceCount, flaggedPendingCount}` |
| `attempt-rejected` | `{studentNo, code, at}` |

15 sn'de bir yorum satırı (`: ping`) gönderilir. Emitter zaman aşımı 30 dk; istemci `EventSource` ile otomatik yeniden bağlanır ve yeniden bağlanınca listeyi REST ile tazeler.

## 5. Sağlık
`GET /actuator/health` → herkese açık, yalnızca durum.
