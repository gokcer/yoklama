# 06 — Frontend Uygulama Rehberi (Angular 22)

## 1. Workspace

```bash
cd yoklama
npx @angular/cli@22 new yoklama-web --directory frontend --routing --style=scss --ssr=false --skip-git
cd frontend
npm i zxing-wasm qrcode
npm i -D @types/qrcode
npx ng generate web-worker scanner/decoder
```
- CLI'nin ürettiği varsayılanlar korunur: standalone bileşenler, **zoneless** change detection, Vitest test koşucusu. Tüm durum yönetimi **signals** ile (`signal`, `computed`, `effect`, `input()`, `output()`); RxJS yalnızca `HttpClient` sınırında.
- `angular.json`:
  - `outputPath: "dist/yoklama-web"` (application builder → `dist/yoklama-web/browser`)
  - `baseHref: "/"`
  - assets'e zxing wasm'ı ekleyin (paketteki gerçek yolu `ls node_modules/zxing-wasm/dist/reader` ile doğrulayın):
    ```json
    { "glob": "*.wasm", "input": "node_modules/zxing-wasm/dist/reader", "output": "zxing" }
    ```
  - Production bütçelerini makul tutun (initial ≤ 1 MB uyarı).
- `proxy.conf.json` (`ng serve --proxy-config proxy.conf.json`):
  ```json
  { "/api": { "target": "http://localhost:8080", "secure": false, "changeOrigin": false },
    "/actuator": { "target": "http://localhost:8080", "secure": false } }
  ```
- `package.json` script'leri: `start` (proxy ile), `build`, `test`.

## 2. Uygulama yapılandırması
```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),        // CLI zaten ekliyorsa tekrar etmeyin
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
      withInterceptors([apiErrorInterceptor])),
  ],
};
```
Uygulama açılışında öğretim üyesi alanına girilirken `GET /api/auth/csrf` bir kez çağrılır (CSRF çerezini oluşturur).

## 3. Rotalar

| Yol | Bileşen | Koruma |
|---|---|---|
| `/` | `HomeComponent` (kod gir → `/c/:code`; "Öğretim üyesi girişi") | — |
| `/c/:code` | `CheckinFlowComponent` | — |
| `/t/login` | `LoginComponent` | — |
| `/t` | `CoursesComponent` | `authGuard` |
| `/t/courses/:id` | `CourseDetailComponent` (roster + oturumlar) | `authGuard` |
| `/t/classrooms` | `ClassroomsComponent` | `authGuard` |
| `/t/sessions/new` | `SessionCreateComponent` (`?courseId=`) | `authGuard` |
| `/t/sessions/:id` | `SessionDashboardComponent` | `authGuard` |
| `/t/sessions/:id/display` | `DisplayComponent` (tam ekran, kabuk/menü yok) | `authGuard` |
| `/t/sessions/:id/calibrate` | `CalibrateComponent` (telefon) | `authGuard` |
| `/t/admin/teachers` | `TeachersComponent` | `adminGuard` |
| `**` | `NotFoundComponent` | — |

Öğretim üyesi rotaları `loadComponent` ile tembel yüklenir; öğrenci yolu (`/c/:code`) ana pakette kalır ve olabildiğince hafif tutulur.

## 4. Klasör yapısı
```
src/app/
├── core/
│   ├── api.service.ts           (tipli HTTP sarmalayıcıları; DTO arayüzleri api.models.ts)
│   ├── api-error.interceptor.ts (sunucu {code,message} → ApiError; 401'de /t/login'e yönlendirme yalnızca /t altında)
│   ├── auth.service.ts, auth.guard.ts
│   ├── clock-sync.service.ts
│   ├── token-codec.ts           (base32, base36, parse, sign — saf fonksiyonlar)
│   ├── sse.service.ts
│   └── storage.ts               (try/catch'li localStorage yardımcıları)
├── scanner/
│   ├── camera.ts                (getUserMedia, track bilgisi)
│   ├── frame-loop.ts            (rVFC / rAF + zaman damgası)
│   ├── decoder.worker.ts        (zxing-wasm)
│   ├── decoder-client.ts        (worker ile iletişim, meşgul bayrağı)
│   ├── scanner-engine.ts        (hepsini birleştirir; signals yayınlar)
│   └── scanner-view.component.ts(video + çerçeve + ilerleme)
├── student/  (home, checkin-flow, ble-step)
├── teacher/  (login, courses, course-detail, classrooms, session-create, dashboard, display, calibrate, admin)
└── shared/   (messages.ts, ui bileşenleri: button, card, badge, dialog; flag-labels.ts)
```

## 5. Çekirdek kod

### 5.1 `token-codec.ts` (02 §3 ile birebir; vektör testleri zorunlu)
```ts
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOKEN_RE = /^Y1\.([A-HJ-NP-Z2-9]{6})\.([0-9A-Z]{1,4})\.([0-9A-Z]{1,9})\.([A-Z2-7]{13})$/;

export function base32(bytes: Uint8Array): string {
  let out = '', buffer = 0, bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(buffer >>> (bits - 5)) & 31]; bits -= 5; }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(buffer << (5 - bits)) & 31];
  return out;
}
export const base36 = (n: number) => n.toString(36).toUpperCase();

export function tokenPrefix(code: string, seq: number, ts: number): string {
  return `Y1.${code}.${base36(seq)}.${base36(ts)}`;
}
export async function importHmacKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
export async function signToken(key: CryptoKey, code: string, seq: number, ts: number): Promise<string> {
  const p = tokenPrefix(code, seq, ts);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(p)));
  return `${p}.${base32(mac.slice(0, 8))}`;
}
export interface ParsedToken { code: string; seq: number; ts: number; raw: string; }
export function parseToken(raw: string): ParsedToken | null {
  const m = TOKEN_RE.exec(raw);
  return m ? { code: m[1], seq: parseInt(m[2], 36), ts: parseInt(m[3], 36), raw } : null;
}
```
İstemci imzayı **doğrulamaz** (anahtarı yok); yalnızca format + kod eşleşmesi + yeni `seq` kontrolü yapar.

### 5.2 `clock-sync.service.ts`
```ts
export interface ClockSync { offsetMs: number; rttMs: number; at: number; }

@Injectable({ providedIn: 'root' })
export class ClockSyncService {
  private readonly current = signal<ClockSync | null>(null);
  readonly sync = this.current.asReadonly();

  async measure(samples = 8): Promise<ClockSync> {
    let best: ClockSync | null = null;
    for (let i = 0; i < samples; i++) {
      const t0 = performance.timeOrigin + performance.now();
      const res = await fetch('/api/public/time', { cache: 'no-store' });
      const { serverTime } = await res.json();
      const t1 = performance.timeOrigin + performance.now();
      const s = { offsetMs: serverTime - (t0 + t1) / 2, rttMs: t1 - t0, at: t1 };
      if (!best || s.rttMs < best.rttMs) best = s;
    }
    this.current.set(best!);
    return best!;
  }
  /** Sunucu saatine çevrilmiş "şimdi" */
  now(): number { return this.toServer(performance.now()); }
  /** performance zaman çizelgesindeki bir değeri (ms) sunucu epoch ms'ine çevirir */
  toServer(perfMs: number): number {
    const s = this.current(); if (!s) throw new Error('clock not synced');
    return performance.timeOrigin + perfMs + s.offsetMs;
  }
}
```
`Date.now()` hiçbir ölçümde kullanılmaz (lint kuralı veya kod incelemesiyle).

### 5.3 Kamera (`camera.ts`)
```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
});
const track = stream.getVideoTracks()[0];
const settings = track.getSettings();        // deviceId, width, height, frameRate
const cameraIdHash = await sha256Hex(settings.deviceId ?? '');
const cameraLabel = track.label;
```
- `<video playsinline muted autoplay>`; `video.srcObject = stream; await video.play()` — **kullanıcı dokunuşu içinden** çağrılır (iOS).
- Bittiğinde `stream.getTracks().forEach(t => t.stop())`.
- `NotAllowedError` → izin reddi ekranı (iOS: Ayarlar › Safari › Kamera; Android: adres çubuğu › Site ayarları). `NotFoundError`/`OverconstrainedError` → kısıtlamaları gevşetip tekrar dene.

### 5.4 Kare döngüsü ve çözme (`frame-loop.ts`, `decoder-client.ts`)
```ts
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true })!;

function onFrame(now: number, meta?: VideoFrameCallbackMetadata) {
  if (!running) return;
  schedule();
  if (decoder.busy) return;                                  // meşgulken kare atla
  const perfT = typeof meta?.captureTime === 'number' ? meta.captureTime : now;
  const source = typeof meta?.captureTime === 'number' ? 'captureTime' : (hasRVFC ? 'callback' : 'raf');
  const frameServerMs = clock.toServer(perfT);
  const scale = Math.min(1, 1280 / video.videoWidth);
  work.width = Math.round(video.videoWidth * scale);
  work.height = Math.round(video.videoHeight * scale);
  wctx.drawImage(video, 0, 0, work.width, work.height);
  const image = wctx.getImageData(0, 0, work.width, work.height);
  decoder.decode(image, frameServerMs, source);             // sonuç gelene kadar `work` canvas'ına yeniden çizilmez
}
function schedule() {
  hasRVFC ? video.requestVideoFrameCallback(onFrame)
          : requestAnimationFrame(t => (video.currentTime !== lastTime ? (lastTime = video.currentTime, onFrame(t)) : schedule()));
}
```
`decoder-client.ts`: `postMessage({id, image}, [image.data.buffer])`; dönüşte `busy=false`; sonuç `{text, corners, w, h, frameServerMs, source}`.

`decoder.worker.ts`:
```ts
/// <reference lib="webworker" />
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';

prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => path.endsWith('.wasm') ? `/zxing/${path}` : prefix + path },
  fireImmediately: true,
});
const opts: ReaderOptions = { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 };

addEventListener('message', async ({ data }) => {
  const { id, image } = data as { id: number; image: ImageData };
  try {
    const r = (await readBarcodes(image, opts)).find(x => x.isValid && x.text);
    const p = r?.position;
    postMessage({ id, w: image.width, h: image.height, text: r?.text ?? null,
      corners: p ? [[p.topLeft.x, p.topLeft.y], [p.topRight.x, p.topRight.y],
                    [p.bottomRight.x, p.bottomRight.y], [p.bottomLeft.x, p.bottomLeft.y]] : null });
  } catch (e) { postMessage({ id, error: String(e) }); }
});
```
> `ReadResult` alan adlarını (`isValid`, `position.topLeft` …) kurulu sürümün `.d.ts` dosyasından doğrulayın; farklıysa uyarlayın.

### 5.5 `ScannerEngine`
Girdi: `sessionCode`, `requiredScans`, `mode: 'checkin' | 'calibration'`, `onNewToken(scan)` geri çağrısı.
Signals: `state: 'idle'|'starting'|'scanning'|'done'|'error'`, `distinct: number`, `lastHint`, `error`.
Davranış:
1. Sonuç geldiğinde `parseToken`; `code` oturum koduyla eşleşmiyorsa yok say (başka oturumun QR'ı) ve ipucu göster.
2. `seq` daha önce görülmediyse: `ScanEvent {token, firstSeenServerMs: frameServerMs, frameTimeSource, frameW: w, frameH: h, corners}` üret; `navigator.vibrate?.(30)`.
3. Bu ilk yeni token ise ve kare yakalama açıksa: `work` canvas'ından 640 px genişliğe ölçekleyip `toBlob('image/jpeg', 0.6)` → kare yükleme (bir sonraki `drawImage`'dan **önce**; decoder meşgul olduğundan zaten çizilmiyor, `toBlob` çağrısı senkron anlık görüntü alır).
4. `checkin` modunda her `ScanEvent` hemen `POST .../scans` ile gönderilir (sıralı kuyruk; ağ hatasında 2 kez yeniden dene). Sunucu `complete: true` dönünce veya yerel `distinct ≥ requiredScans` ve tüm POST'lar tamamlanınca → `done`, kamera kapatılır.
5. `calibration` modunda `requiredScans` yerine 5 farklı token toplanır, toplu gönderilir.
6. 15 sn yeni token yoksa ipucu: "QR'ı çerçevenin ortasında tutun; gerekirse biraz yaklaşın."

### 5.6 Konum
`geoMode === 'FLAG'` ise tarama başlatılırken (aynı kullanıcı etkileşiminde) başlatılır:
```ts
const id = navigator.geolocation.watchPosition(p => { if (!best || p.coords.accuracy < best.accuracyM) best = {...} },
  err => state = err.code === err.PERMISSION_DENIED ? 'DENIED' : 'TIMEOUT',
  { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
// tarama bitince veya en geç 10 sn sonra clearWatch(id)
```
Sonuç `{state:'OK', lat, lng, accuracyM}` veya `{state:'DENIED'|'UNSUPPORTED'|'TIMEOUT'}`. Konum alınamasa da akış durmaz.

### 5.7 SSE (`sse.service.ts`)
`EventSource('/api/sessions/{id}/events')` (aynı origin, çerez otomatik). Her olay türü için `addEventListener`. `onerror` → kapat, 2 sn → 4 sn → 8 sn (en fazla 15 sn) sonra yeniden bağlan; her (yeniden) bağlanmada listeyi REST ile tazele. Bileşen yok olunca kapat (`DestroyRef`).

## 6. Öğrenci akışı (`CheckinFlowComponent`)

Durumlar: `loading → (closed | notFound) | enterNo → intro → scanning → [ble] → submitting → done | error`

| Durum | İçerik |
|---|---|
| `loading` | `GET /api/public/sessions/:code` |
| `closed` | "Bu yoklama kapandı." |
| `enterNo` | Başlık `{courseCode} · {title}`; "Öğrenci numaranız" (`inputmode=numeric`, `autocomplete=off`, regex doğrulama); son kullanılan numara localStorage'dan ön doldurulur; "Devam" → `POST /checkins` |
| `intro` | "Projeksiyondaki QR kodu kamerayla okutacaksınız. Ekranı çerçevenin içinde tutun; kod her saniye değişir, {requiredScans} farklı kod okunduğunda işlem tamamlanır." + gizlilik notu + (geo açıksa) "Konum izni de istenecek." + **"Kamerayı başlat"** butonu |
| `scanning` | Tam genişlik video, ortada kare çerçeve, `{n}/{required}` nokta göstergesi (`aria-live=polite`), ipucu satırı, "İptal" |
| `ble` | Yalnızca `bleMode=OPTIONAL` ve `navigator.bluetooth` varsa: "Ek doğrulama (önerilir): Sınıftaki **{beaconName}** cihazını listeden seçin." → "Bluetooth ile doğrula" / "Atla". Hata olursa sessizce `submitting`'e geç. |
| `submitting` | Saat yeniden ölçülür (`sync2`), `POST .../complete` |
| `done` | Büyük onay ikonu, "Yoklamanız alındı", ad/numara, saat (sunucunun `recordedAt` değeri yerel saat diliminde). "Bu sayfayı kapatabilirsiniz." |
| `error` | Sunucunun `message` metni + duruma göre "Tekrar dene" (yeni deneme başlatır) |

Akış sırası (`intro` → "Kamerayı başlat" tıklaması içinde): kamerayı aç → konum izlemeyi başlat → `ClockSync.measure()` → `POST .../sync` → tarama.

BLE adımı (Android Chrome):
```ts
const n = await api.bleNonce(attemptId);
const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [n.serviceUuid] }] });
const gatt = await dev.gatt!.connect();
const svc = await gatt.getPrimaryService(n.serviceUuid);
await (await svc.getCharacteristic(n.nonceCharUuid)).writeValueWithResponse(new TextEncoder().encode(n.nonce));
const resp = new TextDecoder().decode(await (await svc.getCharacteristic(n.responseCharUuid)).readValue());
gatt.disconnect();
await api.bleVerify(attemptId, resp.trim());
```
TypeScript tipleri için `@types/web-bluetooth` (dev bağımlılık).

## 7. Öğretim üyesi ekranları

### 7.1 Display (`DisplayComponent`) — projeksiyon
- Açılışta: `GET display-config` → `importHmacKey(base64→bytes)` → `ClockSync.measure()`; her 60 sn yeniden senkron. `navigator.wakeLock?.request('screen')`. "Tam ekran" butonu (`document.documentElement.requestFullscreen()`).
- Düzen: beyaz arka plan; solda QR (`min(88vh, 62vw)` kare), sağda panel: ders kodu + başlık, **katılım kodu** büyük harflerle, kısa katılım adresi + küçük statik katılım QR'ı (`joinUrl`), canlı katılım sayısı (SSE `session` olayı), kalan süre. QR'ın altında slot ilerleme çubuğu.
- QR çizimi: `QRCode.toCanvas(offscreen, token, { errorCorrectionLevel: 'M', margin: 4, scale: 1, color: { dark: '#000000', light: '#ffffff' } })` ile modül matrisi üretilir; görünür canvas'a `imageSmoothingEnabled = false` ile **tam sayı piksel/modül** ölçeğinde kopyalanır (33 modül = 25 + 2×4 kenar boşluğu). Alternatif: `QRCode.create(token, {errorCorrectionLevel:'M'})` ile matrisi alıp `fillRect` ile kendiniz çizin (en keskin sonuç — tercih edilen).
- Döngü (02 §4):
```ts
async function prepare(seq: number) {
  const ts = cfg.epochStartMs + seq * cfg.refreshMs;
  const token = await signToken(key, cfg.code, seq, ts);
  const canvas = renderQrToOffscreen(token);          // QRCode.create + fillRect
  prepared.set(seq, { seq, ts, canvas });
}
function tick() {
  requestAnimationFrame(tick);
  const now = clock.now();
  if (now < cfg.epochStartMs) return showStarting();
  if (now >= closesAtMs) return showClosed();
  const k = Math.floor((now - cfg.epochStartMs) / cfg.refreshMs);
  if (k !== shownSeq) {
    const p = prepared.get(k);
    if (p) { blit(p.canvas); shownSeq = k; prepared.delete(k); void prepare(k + 1); }
    else { lateFrames++; void prepare(k); }
  }
  progress.set((now - (cfg.epochStartMs + k * cfg.refreshMs)) / cfg.refreshMs);
}
```
- Gizli debug katmanı (`d` tuşu): offset, rtt, `lateFrames`, gösterilen seq.
- Sekme görünmez olunca (`visibilitychange`) dönüşte yeniden senkron.

### 7.2 Dashboard (`SessionDashboardComponent`)
- Üst bar: ders, başlık, durum rozeti, kalan süre, **Aç / Uzat (+5 dk) / Kapat**, **Display'i aç** (yeni pencere), **Kalibrasyon** (telefonda açılacak adresin QR'ını gösteren dialog), **CSV indir**, eşik bilgisi ("Gecikme eşiği: 330 ms · kalibre" / "varsayılan").
- Sayaçlar: Katılan · İnceleme bekleyen · Roster'da olup gelmeyen.
- Tablo: No, Ad, Saat, Durum (rozet: Kabul / Şüpheli / Onaylandı / Reddedildi / Manuel), bayrak çipleri (Türkçe kısa etiket, `shared/flag-labels.ts`), gecikme (ms, eşik aşımı kırmızı), BLE ikonu. Filtre: Tümü / İnceleme bekleyen / Kabul / Reddedilen. Yeni kayıt satırı kısa süre vurgulanır.
- Satır detay paneli: kamera karesi (`<img src="/api/sessions/{id}/attendances/{attId}/frame">`), tüm metrikler ve bayrak açıklamaları (07 §3 tablosundaki açıklamalar), user agent, kamera etiketi; **Onayla / Reddet / Kararı kaldır**, not alanı; "Kaydı sil".
- "Manuel ekle" dialog'u (öğrenci no, not).
- "Reddedilen denemeler" sekmesi (`GET .../attempts?state=REJECTED`).

### 7.3 Kalibrasyon (`CalibrateComponent`) — öğretim üyesinin telefonu
- Açıklama: "Display açıkken sınıfın önünden, ortasından ve arkasından birer tur okutun."
- Konum seçimi (Ön / Orta / Arka / Diğer) → "Turu başlat" → `ScannerEngine(mode:'calibration')` 5 farklı token → gönder → sonuç kartı: min gecikme, max alan oranı.
- Tur listesi (sil butonu) ve hesaplanan baseline/eşik.

### 7.4 Diğer
- Dersler: liste + oluştur/düzenle; ders detayında roster tablosu, CSV içe aktarma (REPLACE/MERGE seçimi, sonuç raporu), tek öğrenci ekle/sil; oturum listesi + "Yeni oturum".
- Derslikler: ad, enlem/boylam/yarıçap (opsiyonel; "Şu anki konumumu kullan" butonu), BLE beacon ID, "BLE anahtarı üret" (tek seferlik gösterim + kopyala + firmware `secrets.h` satırı olarak göster).
- Oturum oluşturma formu: ders, derslik, başlık, süre, gelişmiş ayarlar (refresh, gerekli tarama, roster zorunlu, konum, BLE, kare yakalama) — varsayılanlar sunucudan.

## 8. Stil ve UX
- Saf SCSS, `styles/_tokens.scss` içinde CSS değişkenleri (renkler, boşluk, yarıçap, gölge), sistem font yığını.
- Öğrenci ekranı mobil öncelikli: tek sütun, büyük dokunma hedefleri (≥ 48 px), yüksek kontrast, ekran kenarlarında 16 px boşluk, yatay kaydırma yok.
- Display: yalnızca beyaz/siyah QR + sade panel; animasyon yok (QR değişimini bozmasın).
- Tüm kullanıcıya görünen metinler Türkçe; `shared/messages.ts` içinde toplanır. Kod tanımlayıcıları İngilizce.
- Sunucu hata mesajları (`message`) doğrudan gösterilir.

## 9. Tarayıcı uyumluluğu notları
- Kamera, konum, Web Bluetooth ve WebCrypto **güvenli bağlam** (HTTPS veya `localhost`) ister.
- iOS Safari: `playsinline` zorunlu; kamera başlatma kullanıcı dokunuşu içinde; `requestVideoFrameCallback` destekli ama `captureTime` gelmeyebilir → `callback` kaynağı kullanılır.
- Web Bluetooth iOS'ta yok; özellik tespitiyle BLE adımı gizlenir.
- `navigator.wakeLock` her yerde yok; opsiyonel.
