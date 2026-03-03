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
- `RUNTIME_IMAGE_NAMESPACE` (used by runtime catalog presets in admin UI)

Current compose default:
- `ghcr.io/cryptic-stack/probable-adventure-lab-base:latest`

Override locally (example):
```bash
set CHALLENGE_DEFAULT_IMAGE=probable-adventure-lab-base:local
docker build -t probable-adventure-lab-base:local ./images/lab-base
docker compose up --build
```

Set your GHCR namespace once (example):
```bash
set RUNTIME_IMAGE_NAMESPACE=ghcr.io/<your-gh-owner>
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
- `ghcr.io/<owner>/probable-adventure-kali-terminal:latest`
- `ghcr.io/<owner>/probable-adventure-forensics-terminal:latest`
- `ghcr.io/<owner>/probable-adventure-windows-rdp:latest`
- `ghcr.io/<owner>/probable-adventure-ubuntu-xfce-desktop:latest`

## Planning More Images

Runtime image catalog:
- `images/catalog.json`

Add a new image in 3 steps:
1. Add `images/<new-image>/Dockerfile`.
2. Add a `matrix` entry in `.github/workflows/build-runtime-images.yml`.
3. Add a catalog record in `images/catalog.json` with:
   - `id`, `name`, `description`, `image`
   - `default_profile` (type/port/env/capabilities)

The Runtime admin page reads the catalog and exposes `Apply Preset` buttons so new images can be adopted without UI code changes.

Planning reference:
- `docs/RUNTIME_IMAGE_PLAN.md`

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
  "image": "ghcr.io/cryptic-stack/probable-adventure-ubuntu-xfce-desktop:latest",
  "internal_port": 6901,
  "environment": {
    "VNC_RESOLUTION": "1600x900",
    "VNC_PW": "ctf"
  }
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
