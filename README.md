# probable-adventure

Cyber range MVP with Neko-style room access:
- Go API (`chi`)
- Postgres
- Provisioner worker (Docker Engine API)
- Room-first web UI inspired by `neko-rooms`

## What It Does
- Authenticates users with Google OIDC (or local dev bypass)
- Creates range room groups directly from image references
- Provisions room containers and networks via worker jobs
- Exposes one room link per service using Neko-style query params (`usr`, `pwd`)
- Streams range events via SSE

## Prerequisites
- Docker Desktop running
- Go (for local `go test`)
- Optional: `make`

## Configuration
Create `.env` in repo root:

```env
APP_ENV=dev
HTTP_ADDR=:8080
DATABASE_URL=postgres://range:range@localhost:5432/rangedb?sslmode=disable
SESSION_KEY=dev-insecure-session-key-change-me
DEV_AUTH_EMAIL=dev@example.com
ADMIN_EMAILS=dev@example.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URL=http://localhost:8080/auth/google/callback
WORKER_ID=provisioner-1
DOCKER_HOST=unix:///var/run/docker.sock
DOCKERHUB_REPOS=crypticstack/probable-adventure-base-server,crypticstack/probable-adventure-base-user,crypticstack/probable-adventure-attack-box,crypticstack/probable-adventure-web-lab,crypticstack/probable-adventure-desktop-web
DOCKERHUB_IMAGE_REFS=crypticstack/probable-adventure-base-server:bookworm,crypticstack/probable-adventure-base-user:bookworm-xfce,crypticstack/probable-adventure-attack-box:bookworm,crypticstack/probable-adventure-web-lab:bookworm,crypticstack/probable-adventure-desktop-web:bookworm-novnc
```

## Run
With `make`:
- Start: `make dev`
- Logs: `make logs`
- Stop: `make down`

Without `make`:
- Start: `docker compose up -d --build`
- Logs: `docker compose logs -f`
- Stop: `docker compose down -v`

## UI
Open `http://localhost:8080/`.

Current UI flow:
- Create a room group from one image
- Open room links directly (Neko-style)
- Start/stop/restart room containers
- Destroy/recreate room groups
- Watch live events

## Scripts (Neko-style)
### Sync room images
```powershell
pwsh ./scripts/build-range-images.ps1 -Mode pull
```

### Build local room images
```powershell
pwsh ./scripts/build-range-images.ps1 -Mode build -DockerHubUser crypticstack
```

### Load base templates
```powershell
pwsh ./scripts/load-base-templates.ps1 -ApiBase http://localhost:8080
```

### Load scenario templates
```powershell
pwsh ./scripts/load-range-templates.ps1 -ApiBase http://localhost:8080
```

### Cleanup local Neko/range images
```powershell
pwsh ./scripts/cleanup-local-images.ps1 -Force
```

## API Quick Start
### List images
```bash
curl http://localhost:8080/api/catalog/images
```

### Create room group
```bash
curl -X POST http://localhost:8080/api/ranges \
  -H "Content-Type: application/json" \
  -d '{
    "team_id":1,
    "name":"room-group-a",
    "rooms":[
      {"name":"desktop","image":"crypticstack/probable-adventure-desktop-web:bookworm-novnc","network":"guest"}
    ],
    "room":{"user_pass":"neko","admin_pass":"admin","max_connections":8,"control_protection":true}
  }'
```

### Get room group + access links
```bash
curl http://localhost:8080/api/ranges/1
```

### Room lifecycle
```bash
curl -X POST http://localhost:8080/api/ranges/1/rooms/desktop/start
curl -X POST http://localhost:8080/api/ranges/1/rooms/desktop/stop
curl -X POST http://localhost:8080/api/ranges/1/rooms/desktop/restart
```

### Destroy/reset
```bash
curl -X POST http://localhost:8080/api/ranges/1/destroy
curl -X POST http://localhost:8080/api/ranges/1/reset
```

## Test
```bash
go test ./...
```

## References
- neko-rooms: https://github.com/m1k1o/neko-rooms
- Neko: https://github.com/m1k1o/neko
