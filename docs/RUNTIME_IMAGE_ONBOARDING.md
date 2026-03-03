# Runtime Image Onboarding

## Purpose
Standardize how new lab images are added so CTFd runtime profiles can adopt them without plugin code changes.

## Required Files
1. `images/<image-id>/Dockerfile`
2. `.github/workflows/build-runtime-images.yml` matrix entry
3. `images/catalog.json` image record

## Naming Convention
- Folder: `images/<image-id>`
- GHCR image: `{runtime_image_namespace}/probable-adventure-<image-id>:latest`
- Catalog id: `<image-id>`

## Catalog Record Template
```json
{
  "id": "forensics-terminal",
  "name": "Forensics Terminal",
  "description": "Disk and memory analysis tooling.",
  "image": "{runtime_image_namespace}/probable-adventure-forensics-terminal:latest",
  "default_profile": {
    "type": "terminal",
    "internal_port": 7681,
    "startup_command": "",
    "environment": {}
  }
}
```

For RDP-style images:
- Set `"type": "rdp"`
- Set `"internal_port"` to the web desktop gateway port
- Add `privileged/devices/cap_add` only if required by the image

## Workflow Matrix Template
```yaml
- id: forensics-terminal
  context: ./images/forensics-terminal
  image: ghcr.io/${{ github.repository_owner }}/probable-adventure-forensics-terminal
```

## Validation Checklist
1. `docker build -t probable-adventure-<image-id>:local ./images/<image-id>`
2. `docker run --rm probable-adventure-<image-id>:local <sanity-check-command>`
3. Confirm image appears in Runtime admin catalog card list.
4. Apply preset to a challenge, start session, verify embed.
