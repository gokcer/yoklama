# Yoklama BLE Beacon

ESP32-based BLE beacon for proximity verification.

## Setup

1. Install [Arduino IDE](https://www.arduino.cc/en/software) or [Arduino CLI](https://arduino.github.io/arduino-cli/).
2. Add ESP32 board support (`esp32:esp32`).
3. Install `NimBLE-Arduino` library (v2.x).
4. Copy `secrets.h.example` to `secrets.h`. In the web UI (Derslikler › BLE anahtarı üret) copy the generated
   `secrets.h` block (`BEACON_NAME` = `YKL-<beaconId>`, `BLE_KEY_HEX` = 64 hex chars) into it.
5. Compile and upload:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 .
arduino-cli upload --fqbn esp32:esp32:esp32 -p /dev/ttyUSB0 .
```

## How it works

- The beacon advertises a GATT service with two characteristics.
- Student's phone writes a 16-character nonce to the Nonce characteristic.
- The beacon computes `HMAC-SHA256(bleKey, nonce)`, truncates to 8 bytes, and makes the upper-case hex result
  available on the Response characteristic — stored **per connection**, so concurrent students do not mix answers.
- Nonces that are not 16 base32 characters get the response `ERR`.
- TX power is 3 dBm (`NimBLEDevice::setPower`); adjust to the room size.
- The phone reads the Response and sends it to the server for verification.

## Testing with nRF Connect

1. Connect to the beacon in nRF Connect.
2. Find the service `8f3a0001-...`.
3. Write a UTF-8 string (e.g., `N7F3K9QZ2M4XW8TA`) to the Nonce characteristic.
4. Read the Response characteristic — it should return a 16-character hex string.
5. With the example key from `secrets.h.example` (the B-1 key `20 21 … 3f`) the response must be
   `C96FAE95628876C7` (B-1 vector, `docs/02-PROTOCOL.md`).
