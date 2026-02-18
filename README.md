# probable-adventure

Cyber range MVP with:
- Go API (`chi`)
- Postgres
- Provisioner worker (Docker Engine API)
- Browser dashboard + SSE live events

## What It Does
- Authenticates users with Google OIDC (or local dev bypass)
- Lets admins create range templates
- Lets team members create/destroy/reset ranges
- Queues jobs in Postgres and executes them in a provisioner worker
- Streams range events live via SSE

## Prerequisites
- Docker Desktop running
- Git + Go (for local non-container dev)
- Optional: `make` (if unavailable, use `docker compose` commands directly)

## Configuration
Create a `.env` file in repo root.

```env
APP_ENV=dev
HTTP_ADDR=:8080
DATABASE_URL=postgres://range:range@localhost:5432/rangedb?sslmode=disable
SESSION_KEY=dev-insecure-session-key-change-me

# Local auth bypass (recommended for local dev)
DEV_AUTH_EMAIL=dev@example.com
ADMIN_EMAILS=dev@example.com

# OIDC (leave empty when using DEV_AUTH_EMAIL)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URL=http://localhost:8080/auth/google/callback

WORKER_ID=provisioner-1
DOCKER_HOST=unix:///var/run/docker.sock
DOCKERHUB_REPOS=crypticstack/probable-adventure-base-server,crypticstack/probable-adventure-base-user,crypticstack/probable-adventure-attack-box,crypticstack/probable-adventure-web-lab,crypticstack/probable-adventure-desktop-web
DOCKERHUB_IMAGE_REFS=crypticstack/probable-adventure-base-server:bookworm,crypticstack/probable-adventure-base-user:bookworm-xfce,crypticstack/probable-adventure-attack-box:bookworm,crypticstack/probable-adventure-web-lab:bookworm,crypticstack/probable-adventure-desktop-web:bookworm-novnc
```

## Start / Stop
With `make`:
- Start: `make dev`
- Logs: `make logs`
- Migrate up: `make migrate-up` (optional; `make dev` now runs migrate service automatically via compose)
- Stop + remove volumes: `make down`

Without `make`:
- Start: `docker compose up -d --build`
- Logs: `docker compose logs -f`
- Migrate up:
  `docker compose run --rm migrate -path /migrations -database postgres://range:range@postgres:5432/rangedb?sslmode=disable up`
- Stop + remove volumes: `docker compose down -v`

## Health Check
```bash
curl http://localhost:8080/healthz
```
Expected:
```json
{"status":"ok","db":"ok"}
```

## Authentication Modes
### 1) Dev Bypass (fast local testing)
Set `DEV_AUTH_EMAIL`.

Then:
```bash
curl http://localhost:8080/api/me
```

### 2) Google OIDC
Unset `DEV_AUTH_EMAIL`, set Google OIDC env vars, then open:
- `http://localhost:8080/auth/google/login`

## Use the UI
Open:
- `http://localhost:8080/`

Dashboard supports:
- Login/logout
- List templates
- Create templates from a Docker Hub image dropdown (`/api/catalog/images`)
- Define Neko user/admin credentials in a template `room` profile (aligned with `m1k1o/neko-rooms` style room settings)
- Select service network segment when creating templates (`redteam`, `blueteam`, `netbird`, `corporate`, `guest`)
- Create range
- List ranges
- View range details + port mappings
- One canonical access link per service/container (Neko-style room entrypoint)
- Access links use same-origin proxy URLs: `/api/ranges/{id}/access/{service}/?usr=<name>&pwd=<room_user_password>`
- Destroy/reset range
- Live SSE event stream for selected range

## Build Range Images
Build local images:
```powershell
pwsh ./scripts/build-range-images.ps1 -DockerHubUser crypticstack
```

Push images:
```powershell
docker push crypticstack/probable-adventure-base-server:bookworm
docker push crypticstack/probable-adventure-base-user:bookworm-xfce
docker push crypticstack/probable-adventure-attack-box:bookworm
docker push crypticstack/probable-adventure-web-lab:bookworm
docker push crypticstack/probable-adventure-desktop-web:bookworm-novnc
```

Load matching templates:
```powershell
pwsh ./scripts/load-range-templates.ps1 -ApiBase http://localhost:8080
```
This loads starter templates for:
- `redteam` (`redteam-attack-box`)
- `blueteam` (`blueteam-analyst`)
- `netbird` (`netbird-relay`)
- `corporate` (`corporate-web-lab`)
- `guest` (`guest-web-kiosk`)
- `guest` browser desktop (`guest-desktop-browser`, WebRTC on published port)

Web interaction defaults:
- All curated images expose browser access on container port `8080`
- Desktop/browser access uses `m1k1o/neko` WebRTC
- Derived images (`base-server`, `attack-box`, `web-lab`, `desktop-web`) are built from the WebRTC base image
- Starter templates now include:
  - `8080/tcp` (web UI/signaling)
  - `52000/udp` (WebRTC media EPR)
  - `definition_json.room` with `user_pass`, `admin_pass`, `max_connections`, `control_protection`

## API Workflow (CLI)
### 1) Create template (admin)
```bash
curl -X POST http://localhost:8080/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name":"lab",
    "display_name":"Lab",
    "description":"Demo lab",
    "quota":2,
    "definition_json":{
      "name":"linux-lab",
      "services":[
        {
          "name":"web",
          "image":"nginx:alpine",
          "network":"corporate",
          "ports":[{"container":80,"host":0}]
        }
      ]
    }
  }'
```

### 2) List templates
```bash
curl http://localhost:8080/api/templates
```

### 2b) List Docker Hub catalog images used by template creator
```bash
curl http://localhost:8080/api/catalog/images
```

### 3) Create range (queues provision job)
```bash
curl -X POST http://localhost:8080/api/ranges \
  -H "Content-Type: application/json" \
  -d '{"team_id":1,"template_id":1,"name":"range-a"}'
```

### 4) List ranges
```bash
curl http://localhost:8080/api/ranges
```

### 4b) Get one range with canonical access links
```bash
curl http://localhost:8080/api/ranges/1
```

### 5) Watch live events for a range
```bash
curl -N http://localhost:8080/api/ranges/1/events
```

### 6) Destroy / reset
```bash
curl -X POST http://localhost:8080/api/ranges/1/destroy
curl -X POST http://localhost:8080/api/ranges/1/reset
```

## Operational Checks
Inspect jobs/events/resources directly:

```bash
docker compose exec -T postgres psql -U range -d rangedb -c "select id,job_type,status,attempts,error from jobs order by id desc limit 20;"
docker compose exec -T postgres psql -U range -d rangedb -c "select id,range_id,kind,level,message,created_at from events order by id desc limit 50;"
docker compose exec -T postgres psql -U range -d rangedb -c "select range_id,resource_type,docker_id,service_name from range_resources order by id desc limit 20;"
```

## Security Notes
- Do not use `DEV_AUTH_EMAIL` in production.
- Set a strong `SESSION_KEY` in non-dev environments.
- Do not put secrets in template definitions or event payloads.

## Range Ops Recommendations
- Base scenarios on ATT&CK techniques and map each exercise objective to a specific technique/test case.
- Use Atomic Red Team tests (or CALDERA abilities) to create repeatable attacker actions.
- Use one Docker network per range and enforce deny-by-default ingress/egress at host firewall boundaries.
- Keep management/control plane separate from exercise traffic (dedicated network and credentials).
- Instrument every range with endpoint/network telemetry so students can validate detections.

References:
- neko-rooms: https://github.com/m1k1o/neko-rooms
- NIST SP 800-115 (security testing methodology): https://csrc.nist.gov/pubs/sp/800/115/final
- NIST SP 800-207 (zero trust segmentation principles): https://csrc.nist.gov/pubs/sp/800/207/final
- CISA Zero Trust Maturity Model: https://www.cisa.gov/resources-tools/resources/zero-trust-maturity-model
- MITRE ATT&CK: https://attack.mitre.org/
- MITRE CALDERA: https://caldera.mitre.org/
- Atomic Red Team: https://github.com/redcanaryco/atomic-red-team
- Docker networking docs: https://docs.docker.com/engine/network/
- Neko project: https://github.com/m1k1o/neko
- Neko compose/env reference: https://raw.githubusercontent.com/m1k1o/neko/master/.github/examples/docker-compose.yaml

## Troubleshooting
- Docker pull/login issues: run `docker login`.
- `{\"error\":\"db error\"}` on UI/API: ensure migrations ran. With current compose, restart stack:
  `docker compose down -v && docker compose up -d --build`
- If `/` returns 404 in containerized runs, rebuild API image:
  `docker compose up -d --build`
- If jobs are queued but not running, check provisioner logs:
  `docker compose logs -f provisioner`

## Test
```bash
go test ./...
```
