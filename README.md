# Probable Adventure (CTFd-First Runtime Platform)

Container-first challenge platform with:
- Full CTFd as the primary application (auth/login/team/admin/challenges)
- Runtime orchestration service (`control-service`)
- Custom CTFd plugin module: `runtime_bridge`
- Session-aware proxy routes (`nginx`) for terminal/desktop lab access
- Default lab image + challenge file share image build pipeline (GHCR)

## Run

```bash
docker compose up --build
```

Open `http://localhost`.

First boot goes to the CTFd setup wizard at `/setup`. Complete setup once, then log in as admin and use CTFd normally for users/teams/challenges.

## Runtime Base Image

Base image definition:
- `images/lab-base/Dockerfile`

Includes:
- Ubuntu 24.04
- Bash shell
- `curl`
- `tshark`
- `nano`
- `ttyd` (required for web terminal mode)

Default lab image is controlled by:
- `CHALLENGE_DEFAULT_IMAGE`

Current compose default:
- `ghcr.io/your-org/probable-adventure-lab-base:latest`

Override locally (example):
```bash
set CHALLENGE_DEFAULT_IMAGE=probable-adventure-lab-base:local
docker build -t probable-adventure-lab-base:local ./images/lab-base
docker compose up --build
```

## Challenge File Share Image

File share image definition:
- `images/challenge-fileshare/Dockerfile`

Compose service:
- `fileshare` serves `./challenge-files` at `http://fileshare:8080` (internal network)

Every runtime container gets:
- `FILE_SHARE_URL` environment variable (default `http://fileshare:8080`)

Use inside a running lab container:
```bash
curl -fsSL "${FILE_SHARE_URL}/tooling/script.sh" -o /tmp/script.sh
```

Put challenge assets in:
- `challenge-files/`

## GitHub Build/Push

Workflow:
- `.github/workflows/build-runtime-images.yml`

Builds and pushes on `main` (or manual dispatch):
- `ghcr.io/<owner>/probable-adventure-lab-base:latest`
- `ghcr.io/<owner>/probable-adventure-challenge-fileshare:latest`

## API Summary

- CTFd plugin endpoints:
  - `GET /plugins/runtime/health` (available after CTFd setup is complete)
  - `GET /plugins/runtime/capabilities` (authed)
  - `GET /plugins/runtime/challenges` (authed)
  - `POST /plugins/runtime/challenges/{id}/connect` (authed)
  - `POST /plugins/runtime/challenges/{id}/session` (authed) body: `{"action":"start|stop|reset|remove"}`
  - `GET /plugins/runtime/challenges/{id}/sessions` (admin)
  - `GET /plugins/runtime/profiles` (admin)
  - `POST /plugins/runtime/profiles/{id}` (admin)
  - `POST /plugins/runtime/admin/challenges/{id}/sessions/{session_id}/action` (admin)

## Admin Runtime Module

From CTFd admin navigation, use `Runtime` to:
- Manage runtime profile JSON per challenge
- View live session containers by challenge
- Trigger `start/stop/reset/remove` on specific sessions

Runtime profile payload example for challenge `3`:

```json
{
  "type": "rdp",
  "image": "ghcr.io/your-org/probable-adventure-lab-base:latest",
  "internal_port": 8006,
  "environment": {
    "FETCH_URL": "http://fileshare:8080/challenge-3/bootstrap.sh"
  },
  "startup_command": "curl -fsSL \"$FETCH_URL\" | bash"
}
```

## Session URL Model

- Terminal: `/terminal/<challenge_id>/<session_id>/...`
- Desktop/RDP web route: `/desktop/<challenge_id>/<session_id>/<internal_port>/...`

## Notes

- This platform targets Docker containers only (no VM hypervisor manager service).
- Session container naming:
  - `ctfd-challenge-{challenge_id}-session-{session_id}-lab`
- Windows/QEMU images are run as Docker workloads with KVM/TUN device passthrough when available.

## Context Sources

- `qemus/qemu`: https://github.com/qemus/qemu
- `dockur/windows`: https://github.com/dockur/windows
