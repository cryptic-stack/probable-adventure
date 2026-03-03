# Runtime Image Plan

## Goal
Keep runtime images modular so new lab types can be added without changing control-plane code.

## Contract For New Images
Each new image should define:
- Container image tag in GHCR
- Default access type (`terminal` or `rdp`)
- Internal port
- Required runtime settings (`privileged`, `devices`, `cap_add`, env vars)
- Default startup command (if any)

These defaults live in `images/catalog.json` and are surfaced in CTFd Runtime admin as `Apply Preset`.

## Backlog
1. `probable-adventure-kali-terminal` (implemented)
- Use case: offensive-security terminal labs
- Access type: `terminal`
- Port: `7681`

2. `probable-adventure-windows-rdp` (implemented)
- Use case: Windows desktop challenge environments
- Access type: `rdp`
- Port: `8006`
- Host requirement: KVM-capable Docker host

3. `probable-adventure-forensics-terminal` (implemented)
- Use case: disk/memory analysis labs
- Access type: `terminal`
- Port: `7681`
- Packages: sleuthkit, yara, volatility

4. `probable-adventure-webapp`
- Use case: vulnerable web app labs
- Access type: `url`
- Port: app-specific (for example `8080`)

## Release Flow For Any New Image
1. Create `images/<image-name>/Dockerfile`.
2. Add image to `.github/workflows/build-runtime-images.yml` matrix.
3. Add entry to `images/catalog.json`.
4. Push to `main` and let GH workflow publish image to GHCR.
5. In Runtime admin, apply preset to challenge profile and validate launch.
