/*
 * Yoklama BLE beacon — ESP32 + NimBLE-Arduino 2.x (docs/08-BLE-BEACON.md).
 *
 * GATT service with two characteristics:
 *   - Nonce    (write): the phone writes a 16-char base32 nonce
 *   - Response (read) : HEX_UPPER(HMAC-SHA256(bleKey, nonce)[0..8))
 *
 * Responses are kept per connection handle so concurrent students never read each other's answer.
 * The key lives in secrets.h (git-ignored) and is never printed.
 */

#include <NimBLEDevice.h>
#include <map>
#include <string>
#include "mbedtls/md.h"
#include "secrets.h"

static const char* SVC_UUID   = "8f3a0001-5c2e-4b7a-9d61-3e0f7a2b9c10";
static const char* NONCE_UUID = "8f3a0002-5c2e-4b7a-9d61-3e0f7a2b9c10";
static const char* RESP_UUID  = "8f3a0003-5c2e-4b7a-9d61-3e0f7a2b9c10";

static uint8_t bleKey[32];
static std::map<uint16_t, std::string> responses;   // connection handle -> response
static portMUX_TYPE responsesMux = portMUX_INITIALIZER_UNLOCKED;

static bool hexToBytes(const char* hex, uint8_t* out, size_t n) {
  if (strlen(hex) != n * 2) return false;
  for (size_t i = 0; i < n; i++) {
    char b[3] = { hex[2 * i], hex[2 * i + 1], 0 };
    char* end = nullptr;
    out[i] = (uint8_t) strtoul(b, &end, 16);
    if (end != b + 2) return false;
  }
  return true;
}

static std::string hmacHex8(const std::string& msg) {
  uint8_t mac[32];
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_hmac(info, bleKey, sizeof(bleKey), (const unsigned char*) msg.data(), msg.size(), mac);
  static const char* H = "0123456789ABCDEF";
  std::string out;
  out.reserve(16);
  for (int i = 0; i < 8; i++) { out += H[mac[i] >> 4]; out += H[mac[i] & 0x0F]; }
  return out;
}

static bool validNonce(const std::string& n) {
  if (n.size() != 16) return false;
  for (char c : n) if (!((c >= 'A' && c <= 'Z') || (c >= '2' && c <= '7'))) return false;
  return true;
}

static void setResponse(uint16_t conn, const std::string& value) {
  portENTER_CRITICAL(&responsesMux);
  responses[conn] = value;
  portEXIT_CRITICAL(&responsesMux);
}

static std::string getResponse(uint16_t conn) {
  portENTER_CRITICAL(&responsesMux);
  auto it = responses.find(conn);
  std::string v = it != responses.end() ? it->second : std::string();
  portEXIT_CRITICAL(&responsesMux);
  return v;
}

class NonceCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& info) override {
    std::string n = c->getValue();
    setResponse(info.getConnHandle(), validNonce(n) ? hmacHex8(n) : std::string("ERR"));
  }
};

class RespCallbacks : public NimBLECharacteristicCallbacks {
  void onRead(NimBLECharacteristic* c, NimBLEConnInfo& info) override {
    c->setValue(getResponse(info.getConnHandle()));
  }
};

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& info) override {
    // Keep advertising so further students can connect while this one is served.
    NimBLEDevice::startAdvertising();
  }
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& info, int reason) override {
    portENTER_CRITICAL(&responsesMux);
    responses.erase(info.getConnHandle());
    portEXIT_CRITICAL(&responsesMux);
  }
};

void setup() {
  Serial.begin(115200);
  if (!hexToBytes(BLE_KEY_HEX, bleKey, sizeof(bleKey))) {
    Serial.println("BLE_KEY_HEX must be 64 hex characters; halting.");
    while (true) delay(1000);
  }

  NimBLEDevice::init(BEACON_NAME);
  NimBLEDevice::setPower(3);   // dBm; low power keeps the range roughly to the classroom
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

  Serial.printf("Yoklama beacon %s advertising\n", BEACON_NAME);
}

void loop() { delay(1000); }
