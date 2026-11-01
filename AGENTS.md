# Kodlama Ajanı Talimatları

Bu repo bir spesifikasyondan sıfırdan uygulanacak. Kod yazmadan önce `README.md` ve `docs/` altındaki **tüm** dokümanları sırasıyla oku.

## Çalışma şekli
1. `docs/IMPLEMENTATION_PLAN.md` fazlarını sırayla uygula. Bir faz bitmeden sonrakine geçme.
2. Her fazın sonunda: testleri yaz ve çalıştır (`./mvnw verify`, `cd frontend && npm test -- --watch=false`), kabul kriterlerini doğrula, plandaki kutucukları `- [x]` yap.
3. Kullanıcıya soru sorma; makul kararı ver ve `docs/DECISIONS.md`'ye tek satır olarak yaz (`- [Faz N] karar — gerekçe`).
4. Bağlam kaybolursa: plandaki işaretlenmemiş ilk maddeden devam et.
5. Kütüphane API'si dokümandaki örnekten farklıysa (Spring Boot 4.1, Angular 22, zxing-wasm 3.x, NimBLE 2.x), kurulu sürümün tiplerine/belgelerine göre uyarla; davranışı değiştirme.

## Değiştirilemez kurallar
- **Protokol** (`docs/02-PROTOCOL.md`) normatiftir. Token formatı, HMAC girdileri, kodlamalar ve test vektörleri birebir uygulanır. Değişiklik gerekiyorsa önce dokümanı ve vektörleri güncelle, sonra kodu.
- Ölçüm ve kararlarda **istemci duvar saati (`Date.now()`) kullanılmaz**; yalnızca `performance.now()` + ölçülmüş offset. Sunucuda `Clock` bean'i.
- Öğrenciye hiçbir yanıtta bayraklar, gecikme değerleri veya eşikler gönderilmez.
- Oturum anahtarı yalnızca `display-config` ile sahibine gider; ham token, oturum anahtarı ve BLE anahtarı loglanmaz.
- İmza karşılaştırmaları sabit zamanlı.
- Şema yalnızca Flyway ile değişir; migration'lar H2 (PostgreSQL modu) ve PostgreSQL'de çalışmalı.

## Kod stili
- Java: Java 21 özellikleri (record, switch ifadeleri), constructor injection, `final` alanlar, DTO'lar record. Paket yapısı 05 §3.
- Spring Boot 4 / Jackson 3: `tools.jackson.*` (anotasyonlar `com.fasterxml.jackson.annotation`).
- Angular: standalone + signals + `inject()`; zoneless; `OnPush` gerekmez ama şablonlarda signal okuması kullan. Kontrol akışı için `@if/@for/@switch`.
- Kullanıcıya görünen metinler Türkçe; kod tanımlayıcıları, commit mesajları ve yorumlar İngilizce.
- Gereksiz bağımlılık ekleme; UI kütüphanesi yok.

## Komutlar
```bash
./mvnw verify                      # backend + frontend build + testler
./mvnw -Pno-frontend spring-boot:run
cd frontend && npm start           # 4200, /api → 8080 proxy
cd frontend && npm test -- --watch=false
```
