# Yoklama — Rotating QR Attendance System

A web-based classroom attendance system where a projector displays QR codes that refresh every second. Students scan the QR with their phones to check in.

## Architecture

- **Backend:** Spring Boot 4.1 (Java 21) — REST API, HMAC-SHA256 token verification, decision engine
- **Frontend:** Angular 22 — standalone, zoneless, signals; QR decoding via zxing-wasm
- **Database:** PostgreSQL (H2 in PostgreSQL-compatibility mode for local dev)
- **BLE Beacon:** ESP32 (NimBLE) — optional Bluetooth proximity verification

## Quick Start with Docker Compose

The fastest way to run the project. No JDK, Node.js, or database installation required.

```bash
git clone <repo-url> && cd yoklama
docker compose up --build
```

That's it. Open **http://localhost:8080** and log in with `admin` / `admin123`.

To customise settings (database password, admin credentials, etc.):

```bash
cp .env.example .env
# edit .env as needed
docker compose up --build
```

### Default Credentials

| Variable | Default |
|---|---|
| `APP_ADMIN_USERNAME` | `admin` |
| `APP_ADMIN_PASSWORD` | `admin123` |
| `DB_PASSWORD` | `changeme` |

> **Note:** For production deployments with HTTPS and Caddy, see [Production Deployment](#production-deployment) below.

## Local Development (without Docker)

### Prerequisites

- JDK 21+
- Node.js 24.15+ or 26+
- Maven (wrapper included)

### Running

```bash
# Backend (dev profile with H2 database, auto-created admin user admin/admin123)
./mvnw -Pno-frontend spring-boot:run

# Frontend (separate terminal, API proxied to 8080)
cd frontend && npm start
```

Open **http://localhost:4200** in your browser.

### Testing

```bash
# Full build + tests (backend + frontend)
./mvnw verify

# Backend only
./mvnw -Pno-frontend test

# Frontend only
cd frontend && npm test -- --watch=false
```

## Production Deployment

The `deploy/` directory contains a production-ready Docker Compose setup with Caddy for automatic HTTPS.

```bash
cd deploy
cp .env.example .env
# Edit .env — set DOMAIN, DB_PASSWORD, APP_MASTER_SECRET, APP_ADMIN_PASSWORD

# Build and start
docker compose up -d --build
```

Caddy automatically obtains an HTTPS certificate for the configured `DOMAIN` and serves the app at `https://<DOMAIN>` (SSE buffering disabled).
Direct access is limited to `http://127.0.0.1:8080` on the host; PostgreSQL is not exposed externally.
The stack refuses to start if `DB_PASSWORD`, `APP_MASTER_SECRET`, or `APP_ADMIN_PASSWORD` are empty.

### Environment Variables

| Variable | Description |
|---|---|
| `DOMAIN` | Domain for Caddy's automatic HTTPS certificate |
| `APP_MASTER_SECRET` | 32-byte base64-encoded master key (required; `openssl rand -base64 32`) |
| `APP_PUBLIC_BASE_URL` | Public URL (used inside QR codes for the check-in page) |
| `APP_ADMIN_USERNAME` | Initial admin username |
| `APP_ADMIN_PASSWORD` | Initial admin password |
| `APP_FRAMES_DIR` | Camera frame storage directory (default: `./data/frames`) |
| `TZ` | Timezone for CSV exports (default: `Europe/Istanbul`) |

## Usage

### Instructor

1. Log in at `/t/login`
2. Create a course and student roster
3. Add a classroom (optionally with location and BLE beacon)
4. Create a session and click "Start"
5. Click "Display" to open the projector window
6. Monitor live attendance from the dashboard; review flagged records

### Student

1. Enter the 6-digit session code on the home page
2. Enter your student ID
3. Tap "Start Camera" and scan the QR code on the projector
4. Attendance is recorded automatically once the required number of distinct codes is scanned

## Security

- QR tokens are signed with HMAC-SHA256; the session key is shared only between server and display
- Signature comparisons are constant-time (timing attack protection)
- Device cookie (HttpOnly) prevents reuse
- IP/device-based rate limiting on public POST endpoints and login (429 + `Retry-After`)
- Camera frames are collected transparently and auto-deleted after 7 days
- The decision engine only sets flags; the final decision is always the instructor's
- Flags, latency values, and thresholds are never sent to student responses

## License

See [LICENSE](LICENSE) for details.
