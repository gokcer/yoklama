# 10 — Test Stratejisi

## 1. Backend birim testleri (JUnit 5)
| Konu | Zorunlu durumlar |
|---|---|
| `Base32` | 02 §1.2 vektörü; boş dizi → `""` |
| `Base36` | 0, 7, 1295 → `ZZ`, 1760000000000 → `MGJ6K3CW`; küçük harf/geçersiz girdi reddi |
| `SessionKeyDerivation` | KD-1 |
| `QrTokenCodec` | T-1, T-2, T-3 imzalama; parse; verify; 02 §3.2 negatif vektörleri; baştaki sıfırlı seq (`Y1.ABC234.07.…`) → verify false |
| `BleChallenge` | B-1; yanlış yanıt reddi |
| `ScanValidator` | Her 02 §7 satırı için ayrı test (sabit `Clock` ile) |
| Tamamlama koşulu | `[1,2,3]` ✓, `[1,3,6]` ✓ (span 6), `[1,4,7]` ✗, `[5,5,5]` ✗, `[1,2]` ✗ |
| `DecisionEngine` | Her bayrak tek başına; BLE'nin bastırması; eşik kaynağı CALIBRATED/DEFAULT; H1–H5 |
| `GeoMath` | Haversine (bilinen iki nokta, ±1 m) |
| `RosterImportService` | `;` ve `,`, BOM, tırnaklı alan, başlıklı/başlıksız, hatalı satır raporu |
| `CsvExportService` | Türkçe karakter, formül enjeksiyonu kaçışı |

## 2. Backend entegrasyon testleri (`@SpringBootTest` + MockMvc, profil `test`)
Test yardımcısı `TestTokens.forSession(session, seq)` → `SessionKeyDerivation` + `QrTokenCodec.sign` ile geçerli token üretir. `Clock` test konfigürasyonunda `MutableClock` ile değiştirilir.

Senaryolar:
1. Giriş → ders → roster içe aktar → oturum oluştur → aç → display-config (sahip ✓, başka öğretim üyesi 403).
2. Mutlu yol check-in: start → sync → 3 geçerli scan (`firstSeen = ts + 180`) → frame → complete → `ACCEPTED`, SSE yayını (SseHub'a sahte abone ile).
3. `LATENCY_HIGH`: `firstSeen = ts + 700` → `FLAGGED`; kalibrasyon sonrası eşik değişimi.
4. `SCREEN_SUSPECT`: büyük köşe alanı.
5. Süresi geçmiş token (`arrival − ts > 4000`) → scan `TOKEN_EXPIRED`, complete → `NOT_ENOUGH_SCANS`.
6. Aynı cihazla ikinci numara → `DEVICE_ALREADY_USED`; aynı numara başka cihaz → `ALREADY_CHECKED_IN`.
7. Başka cihazın `attemptId`'si ile scan → `ATTEMPT_NOT_FOUND`.
8. Roster dışı numara (`requireRoster=true`) → `NOT_IN_ROSTER`.
9. Kapalı oturum → `SESSION_NOT_OPEN`.
10. BLE: nonce → doğru yanıt → `verified` → gecikme bayrağı bastırılır; süresi geçmiş nonce.
11. Rate limit: dakikada 121. istek → 429.
12. CSV dışa aktarım: gelmeyenler `GELMEDI`.
13. CSRF: `/api/courses` POST, CSRF başlığı olmadan → 403; `/api/public/**` CSRF'siz çalışır.
14. SPA: `GET /t/sessions/5` → `index.html`; `GET /api/olmayan` → 404 JSON.

## 3. Frontend birim testleri (Vitest)
- `token-codec`: T-1/T-2/T-3 (`crypto.subtle` Node'da mevcut), base32 vektörü, parse/negatifler.
- `ClockSyncService`: sahte `fetch` ile en düşük RTT örneğinin seçildiği.
- Display zamanlayıcı mantığı: saf fonksiyona ayrılmış `slotAt(now, epochStart, refresh)`.
- `ScannerEngine`: sahte decoder sonuçlarıyla yeni seq tespiti, kod uyuşmazlığı, ilk karenin yakalanması, `requiredScans` tamamlanması.
- `CheckinFlowComponent` durum geçişleri (sahte ApiService ile).

## 4. Manuel sınıf testi (kabul)
Ön koşul: HTTPS'li ortam, projeksiyon, en az bir iPhone ve bir Android.

| # | Senaryo | Beklenen |
|---|---|---|
| M1 | Kalibrasyon: ön, orta, arka | Baseline ~100–250 ms; eşik baseline+150 |
| M2 | iPhone Safari, arka sıradan normal check-in | ≤ 10 sn'de tamamlanır, `ACCEPTED` |
| M3 | Android Chrome, normal check-in + BLE | `ACCEPTED`, BLE ikonu |
| M4 | QR ekran görüntüsü başka telefondan okutulur | 3 farklı seq toplanamaz → tamamlanmaz |
| M5 | Görüntülü arama (WhatsApp/FaceTime) ile eve aktarım | `LATENCY_HIGH` ve/veya `SCREEN_SUSPECT`; karede ekran görünür |
| M6 | Aynı telefondan ikinci numara | `DEVICE_ALREADY_USED` |
| M7 | Konum kapalı, `geoMode=FLAG` | `GEO_UNAVAILABLE` |
| M8 | 50 kişilik eşzamanlı kullanım (veya k6 ile `/api/public/**` yük testi) | p95 < 300 ms, hata yok |
| M9 | Display 10 dk açık | `lateFrames` ≈ 0, saat sapması düzeltilir |
| M10 | Oturum süresi dolar | Display "kapandı", öğrenci "kapandı", dashboard güncellenir |

Sonuçlar `docs/DECISIONS.md` altında "Saha testi" başlığıyla not edilir; eşik varsayılanları gerekirse güncellenir.
