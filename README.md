# Combined Neko Workspace

This repository now combines both upstream projects:

- `neko/` (https://github.com/m1k1o/neko)
- `neko-rooms/` (https://github.com/m1k1o/neko-rooms)

The previous custom `probable-adventure` codebase has been removed.

## Quick Start

1. Start Docker Desktop.
2. Run:

```bash
docker compose up -d
```

3. Open:
- Neko Rooms: `http://localhost:8080`
- Standalone Neko demo (optional profile): `http://localhost:8090`

To run standalone demo room too:

```bash
docker compose --profile demo up -d
```

## Storage (Enabled By Default)

Root compose now enables persistent room storage out of the box:

- `NEKO_ROOMS_STORAGE_ENABLED=true`
- `NEKO_ROOMS_STORAGE_INTERNAL=/data`
- `NEKO_ROOMS_STORAGE_EXTERNAL=/opt/neko-rooms/data`
- bind mount: `/opt/neko-rooms/data:/opt/neko-rooms/data`

If your Docker host cannot use `/opt/neko-rooms/data`, change both:
- `NEKO_ROOMS_STORAGE_EXTERNAL`
- the matching bind mount source path

## If You See `No such image`

If a room fails with:
`Response from daemon: No such image ghcr.io/m1k1o/neko/firefox:latest`

run:

```bash
docker pull m1k1o/neko:firefox
docker pull m1k1o/neko:chromium
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
