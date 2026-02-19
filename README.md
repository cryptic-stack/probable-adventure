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
