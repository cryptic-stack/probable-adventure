# Combined Neko Workspace

This repository now combines both upstream projects:

- `neko/` (https://github.com/m1k1o/neko)
- `neko-rooms/` (https://github.com/m1k1o/neko-rooms)

The previous custom `probable-adventure` codebase has been removed.

## Quick Start

1. Start Docker Desktop.
2. Create your local env file:

```bash
cp .env.example .env
```

3. Edit `.env` and set `NEKO_ROOMS_NAT1TO1` to your Docker host IP (for LAN use your LAN IP).
4. Run:

```bash
docker compose up -d
```

5. Open:
- Neko Rooms: `http://localhost:8080`
- Standalone Neko demo (optional profile): `http://localhost:8090`

To run standalone demo room too:

```bash
docker compose --profile demo up -d
```

## Published Images

Docker Hub images are published under `crypticstack`:
- `crypticstack/neko-rooms:latest`
- `crypticstack/neko:xfce`
- `crypticstack/neko:kde`

These images are now published by GitHub Actions workflows:
- `.github/workflows/docker-neko-images.yml`
- `.github/workflows/docker-neko-rooms.yml`

Required repository secrets:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## Storage (Enabled By Default)

Root compose now enables persistent room storage out of the box:

- `NEKO_ROOMS_STORAGE_ENABLED=true`
- `NEKO_ROOMS_STORAGE_INTERNAL=/data`
- `NEKO_ROOMS_STORAGE_EXTERNAL=/opt/neko-rooms/data`
- named volume: `neko-rooms-data:/opt/neko-rooms/data`

## Accessible Room Links

Room URLs are generated as relative paths by default (for example `/room/<name>/`), so links stay accessible from whatever IP or hostname users used to open Neko Rooms.

If you want absolute links with a fixed domain, set:
- `NEKO_ROOMS_INSTANCE_URL` (for example `https://rooms.example.com/`)
- `NEKO_ROOMS_NAT1TO1` to your public IP for WebRTC UDP candidate advertisement

## If You See `No such image`

If a room fails with:
`Response from daemon: No such image crypticstack/neko:xfce`

run:

```bash
docker pull crypticstack/neko:xfce
docker pull crypticstack/neko:kde
docker compose up -d
```

## Repo Layout

- `neko/`: upstream source for Neko
- `neko-rooms/`: upstream source for Neko Rooms
- `docker-compose.yml`: combined local runtime composition

## Update Upstream Sources

Replace directory contents from upstream repos as needed:
- https://github.com/m1k1o/neko
- https://github.com/m1k1o/neko-rooms

## Validation

Run tests:

```bash
cd neko-rooms && go test ./...
```

`neko/server` includes CGO + Linux desktop dependencies (X11/GStreamer) and does not fully compile on a plain Windows host. Portable subset:

```bash
cd neko/server
go test ./internal/member/file ./pkg/types ./pkg/types/codec ./pkg/types/event ./pkg/types/message ./pkg/utils ./pkg/xinput ./pkg/xorg
```
