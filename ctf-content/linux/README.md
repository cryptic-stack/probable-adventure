# Linux Lab Challenge Pack

Security note:
- Do not publish internal/local filesystem paths, hostnames, or IPs in exported docs.
- This pack intentionally avoids embedding local source paths.

## Files
- `linux_challenges.csv`: CTFd CSV import file
- `linux_challenges.json`: JSON mirror of CSV rows
- `linux_manifest.json`: simplified challenge/flag manifest

## Regenerate
```bash
python scripts/generate_linux_challenges.py
```

Custom paths:
```bash
python scripts/generate_linux_challenges.py --source "Labs/linux" --output "ctf-content/linux"
```

Custom runtime image:
```bash
python scripts/generate_linux_challenges.py --runtime-image "ctfd-linux-lab-base:latest"
```

## Runtime Integration
- Generated challenges use `connection_info.schema = ctfd-access-v1`
- Access type is `terminal`
- Provisioning image is `ctfd-linux-lab-base:latest`
- The static challenge flag is also injected into `/opt/ctf/flag.txt` at runtime
- Workflow rule: Linux questions always connect players to the Linux base image runtime.

## Content Sanitization
- Setup-only onboarding content is excluded (for example VM/VPN bootstrap tasks).
- Generic workstation setup tasks are excluded.
- Command-by-command walkthroughs are not embedded in challenge descriptions.
- Generated hints are intentionally less revealing to avoid solving the task in the prompt itself.

## Dynamic Scoring
- Advanced and Expert challenges are generated as `dynamic` challenge type.
- Initial value: full base points.
- Decay: `5` solves.
- Minimum value: `50%` of base points.
- Effect: first solve gets full points, then value decreases and clamps at 50% by solve 5+.

## Base Image Build
```bash
docker compose build linux-lab-base
```

## Import into CTFd (CLI)
```bash
python manage.py import_challenges_csv ctf-content/linux/linux_challenges.csv
```

Replace existing challenges during import:
```bash
python manage.py import_challenges_csv --truncate-existing ctf-content/linux/linux_challenges.csv
```
