# Karar Kaydı

Uygulama sırasında dokümanlarda açıkça belirtilmemiş her karar buraya tek satır olarak eklenir.

Biçim: `- [Faz N] karar — gerekçe`

## Spesifikasyon kararları (başlangıç)
- [Spec] QR tokenı display tarayıcısında imzalanır, `ts` planlı slot zamanıdır — gecikme ölçümü için damga, ekrana basılma anına mümkün olduğunca yakın olmalı; sunucu `ts == epochStart + seq*refresh` eşitliğini doğrular.
- [Spec] İmza 8 bayta (64 bit) kısaltıldı — QR'ın sürüm 2'de (25×25) kalması ve uzaktan okunabilirlik; token ömrü saniyeler olduğu için yeterli.
- [Spec] Sezgisel kontroller reddetmez, işaretler — istemci ölçümleri sahtelenebilir; nihai karar öğretim üyesinde.
- [Spec] Varsayılan `refreshMs=1000`, `requiredScans=3`, `maxSpanSlots=6` — sıkı ardışıklık yerine pencere; eski telefonlar ve ağ sıçramaları için tolerans.
- [Spec] Kamera karesi şeffaf şekilde (bilgi notuyla) ve düşük çözünürlükte toplanır, 7 gün sonra silinir.

## Uygulama kararları
- [Faz 0] frontend-maven-plugin Node sürümü v24.15.0 — Angular 22 CLI gereksinimleri ile npm uyumluluğu dengesi
- [Faz 0] Spring Security 7 DaoAuthenticationProvider(userDetailsService) kurucu kullanımı — setUserDetailsService() kaldırıldı
- [Faz 4] Saf SCSS ile tasarım, UI kütüphanesi kullanılmadı — spesifikasyon gereği
- [Faz 4] Tüm UI metinleri shared/messages.ts'de toplanarak Türkçe — belge gereği
- [Faz 5] QR çizimi QRCode.create + fillRect ile — en keskin sonuç, imageSmoothingEnabled=false
- [Faz 5] ClockSyncService: performance.timeOrigin + performance.now() + offset — Date.now() kullanılmadı
- [Faz 6] ~~RateLimitFilter henüz uygulanmadı~~ → [İnceleme] Bucket4j + Caffeine ile uygulandı (05 §7); YD çerezi filtre sırasından önce okunduğu için cihaz kovası çerezsiz ilk istekte atlanır, IP kovası yine geçerli
- [Faz 7] Web Bluetooth tipler `navigator as any` ile kullanıldı — @types/web-bluetooth yerine, tarayıcı uyumluluğu sınırlı
- [Faz 9] ~~Kalibrasyon baseline: max(minLatency)~~ → [İnceleme] 07 §5'teki gibi medyan(minLatency) (çift sayıda turda ortadaki ikisinin ortalaması); alan için max(maxAreaRatio)
- [Faz 10] ESP32 firmware derlenmedi (Arduino CLI kurulu değil) — nRF Connect ile B-1 vektörü ile manuel test yapılabilir
- [Faz 11] CSP: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline' — wasm ve worker uyumlu

## İnceleme ve hata düzeltme (2026-10-25)
- [İnceleme] ClassSession.course, ClassSession.classroom ve Course.owner EAGER — open-in-view kapalıyken controller'lardaki DTO eşlemesi LazyInitializationException veriyordu
- [İnceleme] Türetilmiş sorgularda `Owner_Id` / `Session_Id` açık yol — entity'deki `getOwnerId()`/`getSessionId()` getter'ları Spring Data'nın yanlış özelliğe çözümlemesine yol açıyordu
- [İnceleme] Kesin red (07 §1) ayrı transaction'da kaydedilir — önceden istisna ile birlikte geri alınıyor, "Reddedilen denemeler" hep boş kalıyordu
- [İnceleme] SSE olayları LiveEvents → @TransactionalEventListener(AFTER_COMMIT) ile yayınlanır; `attendance` olayı tam AttendanceDto taşır
- [İnceleme] Erken kapatmada closesAt = closedAt — token penceresi ve display "kapandı" durumu kapanışla tutarlı olsun
- [İnceleme] Kalibrasyonda tekrarlanan seq tek sayılır; gecikme = firstSeenServerMs − ts (önceden now − firstSeen hesaplanıyordu)
- [İnceleme] geoMode=FLAG iken OK dışındaki her durum (SKIPPED/eksik dâhil) GEO_UNAVAILABLE — istemci "SKIPPED" diyerek bayraktan kaçamasın; konum yalnızca FLAG modunda saklanır
- [İnceleme] Doğruluk değeri gelmeyen konum GEO_LOW_ACCURACY sayılır
- [İnceleme] cameraIdHash yalnızca 64 hex ve boş dizgenin SHA-256'sı değilse kullanılır — deviceId vermeyen tarayıcılar sahte CAMERA_REUSED üretmesin
- [İnceleme] BLE nonce'u doğrulama denemesinde (başarılı/başarısız) tüketilir; nonce yoksa/süresi geçtiyse BLE_NONCE_EXPIRED
- [İnceleme] CSV'de "gelmedi" satırları requireRoster'dan bağımsız, roster varsa eklenir (04 §4.6 "Roster varsa")
- [İnceleme] CSV saat sütunu sunucu saat dilimiyle; Docker'da TZ=Europe/Istanbul varsayılan
- [İnceleme] Roster CSV'de aynı numara birden çok kez geçerse son satır alınır, öncekiler `skipped` sayılır
- [İnceleme] Öğretim üyesi kendi hesabını devre dışı bırakamaz (kilitlenmeyi önlemek için)
- [İnceleme] Statik dosyalar: hash'li paketler 1 yıl immutable, diğerleri no-cache; uzantılı ama bulunmayan dosya index.html yerine 404
- [İnceleme] Display rotası öğretim üyesi kabuğunun dışına taşındı (06 §3 "kabuk/menü yok")
- [İnceleme] Dashboard kalan süre ClockSyncService ile hesaplanır (Date.now() yok)
- [İnceleme] Öğrenci akışında kamera, kullanıcı dokunuşu içinde ağ beklemesinden önce açılır (iOS); saat senkronu sonra yapılır
- [İnceleme] docker-compose: PostgreSQL portu dışarı açılmaz, gizli değerler için varsayılan yok (`${VAR:?}`), Caddy ile HTTPS (09 §2)
- [İnceleme] ESP32 firmware'i bağlantı başına yanıt saklar (08 §3.2); önceki tek global yanıt eşzamanlı bağlantılarda karışıyordu

## İnceleme ve iyileştirme (2026-10-27)
- [İnceleme] Derslikler "Konumumu kullan": zoneless'ta geolocation geri çağrısı değişiklik algılamayı tetiklemiyordu, alanlar boş görünüyordu — `markForCheck()` ve "Konum alınıyor…" durumu eklendi
- [İnceleme] Öğrenci tarama ilerlemesi sunucunun `distinctValid` değerinden gösterilir — yerel çözülen sayı reddedilen tokenlarla "5 / 3" gibi gerçeği aşabiliyordu
- [İnceleme] Öğrenci ekranları `100dvh` + `safe-area-inset` kullanır — mobil tarayıcı çubukları "İptal" butonunu örtüyordu
- [İnceleme] Display katılım QR'ı `effect` ile çizilir (canvas render'dan sonra oluşur); render döngüsündeki hazırlık hataları yakalanır
- [İnceleme] Ana sayfa kod girişi yazarken büyük harfe çevrilir ve 02 §1.3 alfabesi dışındaki karakterleri atar; "Devam" yalnızca 6 karakterde etkin
- [İnceleme] Dashboard "Katılan" sayacı `present` kayıtları sayar (reddedilenler dahil değil); "Gelmeyen" CSV'deki GELMEDI kuralıyla aynı (kaydı olmayan roster öğrencisi)
- [İnceleme] Dashboard'a arama, bekleyen satırlarda hızlı Onayla/Reddet, gelmeyenler listesi (+manuel ekle), katılım adresi kopyalama, Esc ile dialog kapatma eklendi; başarı mesajı hata bandından ayrıldı
- [İnceleme] Oturum oluşturma: varsayılan başlık bugünün tarihi; derslik desteklemiyorsa Konum/BLE seçenekleri devre dışı ve OFF'a düşer (sunucu hatası yerine); "Oluştur ve başlat" kısayolu
- [İnceleme] Admin "Yeni kullanıcı" önceki düzenleme durumunu sıfırlar — önceden düzenlenen kullanıcıyı güncelliyordu
