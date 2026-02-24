# Security Checklist (Public CTF)

## Critical host controls

- Run rootless Docker for lab workloads where feasible.
- Disable Docker remote API and deny docker.sock except orchestrator host.
- Enforce host firewall allowlist: `80/443` public only.
- Disable SSH password auth and restrict SSH by IP allowlist.
- Enable fail2ban (or CrowdSec) for SSH and Nginx auth paths.
- Patch hosts on fixed maintenance schedule.

## Runtime isolation

- `read_only` filesystem for lab containers when possible.
- `cap_drop: [ALL]`
- `security_opt: [no-new-privileges]`
- Seccomp + AppArmor profiles
- Per-container `pids_limit`, CPU, memory, I/O quotas
- Dedicated bridge network per session/user

## Application security

- JWT access tokens: 10-15 minutes max
- Refresh token in HttpOnly + Secure + SameSite cookie
- Strict CORS allowlist
- CSP + HSTS + no-sniff + frame deny
- Constant-time flag comparison and brute-force delays
- Per-user/team/API rate limits and lockout strategy

## Abuse detection

- Detect excessive process forks, scans, reverse shells, egress spikes
- Kill session and container on policy violation
- Temporary ban + auditable event record
- Alerting pipeline to moderator/admin channel

## Logging and forensics

- Log auth events, session start/stop, submission events, moderation actions
- Encrypt terminal recordings before storage in MinIO
- Use immutable retention policy for replay evidence
- Keep separate audit index for ban decisions
