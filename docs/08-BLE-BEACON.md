# 08 — BLE Beacon (opsiyonel, ESP32)

Android öğrenciler için ek yakınlık kanıtı. iOS'ta Web Bluetooth olmadığından zorunlu tutulmaz; `bleVerified=true` olan kayıtlarda gecikme/ekran bayrakları bastırılır (07 §3.1).

## 1. Donanım
- Herhangi bir ESP32 (ESP32-WROOM, ESP32-C3 veya ESP32-S3) geliştirme kartı, USB güç.
- Dersliğin önüne, projeksiyona yakın sabitlenir.

## 2. Yazılım ortamı
- Arduino IDE 2.x veya PlatformIO; Espressif Arduino core 3.x.
- Kütüphane: **NimBLE-Arduino 2.x** (callback imzaları 1.x'ten farklıdır; aşağıdaki kod 2.x içindir).
- HMAC için çekirdekle gelen `mbedtls`.

## 3. Dosyalar (`firmware/ble-beacon/`)
```
firmware/ble-beacon/
├── ble-beacon.ino
├── secrets.h.example
└── README.md          (kurulum, anahtar yükleme, test)
```

### 3.1 `secrets.h.example`
```cpp
#pragma once
// Dashboard › Derslikler › "BLE anahtarı üret" çıktısından kopyalayın, dosyayı secrets.h olarak kaydedin.
#define BEACON_NAME "YKL-101"
#define BLE_KEY_HEX "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f"
```
`secrets.h` `.gitignore`'a eklenir.

### 3.2 `ble-beacon.ino` (referans)
```cpp
#include <NimBLEDevice.h>
#include <map>
#include "mbedtls/md.h"
#include "secrets.h"

static const char* SVC_UUID   = "8f3a0001-5c2e-4b7a-9d61-3e0f7a2b9c10";
static const char* NONCE_UUID = "8f3a0002-5c2e-4b7a-9d61-3e0f7a2b9c10";
static const char* RESP_UUID  = "8f3a0003-5c2e-4b7a-9d61-3e0f7a2b9c10";

static uint8_t bleKey[32];
static std::map<uint16_t, std::string> responses;   // bağlantı tanıtıcısı -> yanıt

static void hexToBytes(const char* hex, uint8_t* out, size_t n) {
  for (size_t i = 0; i < n; i++) { char b[3] = { hex[2*i], hex[2*i+1], 0 }; out[i] = (uint8_t) strtoul(b, nullptr, 16); }
}

static std::string hmacHex8(const std::string& msg) {
  uint8_t mac[32];
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_hmac(info, bleKey, sizeof(bleKey), (const unsigned char*) msg.data(), msg.size(), mac);
  static const char* H = "0123456789ABCDEF";
  std::string out; out.reserve(16);
  for (int i = 0; i < 8; i++) { out += H[mac[i] >> 4]; out += H[mac[i] & 0x0F]; }
  return out;
}

static bool validNonce(const std::string& n) {
  if (n.size() != 16) return false;
  for (char c : n) if (!((c >= 'A' && c <= 'Z') || (c >= '2' && c <= '7'))) return false;
  return true;
}

class NonceCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& info) override {
    std::string n = c->getValue();
    responses[info.getConnHandle()] = validNonce(n) ? hmacHex8(n) : std::string("ERR");
  }
};

class RespCallbacks : public NimBLECharacteristicCallbacks {
  void onRead(NimBLECharacteristic* c, NimBLEConnInfo& info) override {
    auto it = responses.find(info.getConnHandle());
    c->setValue(it != responses.end() ? it->second : std::string(""));
  }
};

class ServerCallbacks : public NimBLEServerCallbacks {
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& info, int reason) override {
    responses.erase(info.getConnHandle());
  }
};

void setup() {
  hexToBytes(BLE_KEY_HEX, bleKey, sizeof(bleKey));
  NimBLEDevice::init(BEACON_NAME);
  NimBLEDevice::setPower(3);                       // dBm; menzili sınıfa göre ayarlayın (düşük = kısa menzil)
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  server->advertiseOnDisconnect(true);
  NimBLEService* svc = server->createService(SVC_UUID);
  svc->createCharacteristic(NONCE_UUID, NIMBLE_PROPERTY::WRITE)->setCallbacks(new NonceCallbacks());
  svc->createCharacteristic(RESP_UUID, NIMBLE_PROPERTY::READ)->setCallbacks(new RespCallbacks());
  svc->start();
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->setName(BEACON_NAME);
  adv->addServiceUUID(SVC_UUID);
  adv->enableScanResponse(true);
  adv->start();
}

void loop() { delay(1000); }
```
> NimBLE-Arduino'nun kurulu sürümündeki API adlarını (ör. `setPower` imzası, `enableScanResponse`) örnek projelerle doğrulayın; mantık aynı kalmalı: servis UUID'si yayında, nonce yazılınca **bağlantıya özel** yanıt, okununca o yanıt.
> Eşzamanlı bağlantı sayısı NimBLE yapılandırmasıyla (`CONFIG_BT_NIMBLE_MAX_CONNECTIONS`, genellikle 3–9) sınırlıdır; öğrenci bağlantıları 1–2 sn sürdüğünden yeterlidir.

## 4. Test
1. Seri monitörde başlangıç logu (opsiyonel `Serial.println`).
2. Android'de nRF Connect: `YKL-101` görünmeli, servis UUID'si listelenmeli.
3. Nonce karakteristiğine `N7F3K9QZ2M4XW8TA` (ASCII) yazın, yanıt karakteristiğini okuyun → **B-1 vektörü** ile aynı anahtar kullanıldıysa `C96FAE95628876C7`.
4. Uçtan uca: BLE açık bir oturumda Android Chrome ile check-in; dashboard'da BLE ikonu.

## 5. Güvenlik notları
- Anahtar yalnızca firmware'de ve sunucu veritabanında. Anahtar yenilenirse firmware tekrar yüklenmeli.
- Nonce tek kullanımlık ve 60 sn ömürlü; kaydedilmiş bir yanıt tekrar kullanılamaz.
- BLE aktarma (relay) saldırısı teorik olarak mümkün ama canlı bir suç ortağı ve özel donanım gerektirir; kapsam dışı.
