# CTFd Improvement Plan (Bastion Overlay)

This repository is now reset to upstream CTFd code as the base platform.

## Goal
Keep CTFd core mostly upstream-compatible, and layer the custom browser-shell/lab hardening features as plugins and external services.

## Baseline Strategy
- Track upstream CTFd closely.
- Avoid patching core CTFd internals unless required.
- Build all major additions as:
  - CTFd plugin(s)
  - Sidecar services (broker/orchestrator/recording)
  - Reverse-proxy and infra controls

## Key Improvements To Reintroduce
1. Browser-only shell access with PTY bridge.
2. Ephemeral per-user challenge labs (auto-TTL destroy).
3. Strong challenge runtime isolation and abuse controls.
4. Session recording + replay pipeline.
5. Additional anti-cheat signals for public events.
6. Optional RDP/web desktop channel for GUI challenges.

## CTFd Integration Architecture
- CTFd remains system of record for users, teams, scoring, challenges.
- New plugin: `CTFd/plugins/bastion_labs`
  - Adds challenge type metadata and launch controls.
  - Calls broker/orchestrator APIs.
  - Extends challenge views with "Launch Lab" and "Open Terminal".
- Broker service (WebSocket PTY proxy)
  - Validates short-lived CTFd-issued lab tokens.
  - Attaches user to assigned container only.
- Orchestrator service
  - Spawns/destroys containers and enforces limits.

## Proposed Implementation Phases

### Phase 1: Plugin + Launch Flow (MVP)
- Add `bastion_labs` plugin skeleton.
- Add plugin DB tables:
  - `lab_sessions`
  - `lab_policies`
  - `lab_events`
- Add API endpoints (plugin scoped):
  - `POST /plugins/bastion-labs/challenges/<id>/launch`
  - `GET /plugins/bastion-labs/challenges/<id>/session`
  - `POST /plugins/bastion-labs/challenges/<id>/terminate`
- Frontend:
  - CTFd challenge modal gets Launch/Connect actions.
  - Web terminal pane using xterm.js.

### Phase 2: PTY Broker + Token Model
- Broker accepts signed, short-lived launch token from CTFd plugin.
- Claims:
  - user_id
  - team_id
  - challenge_id
  - container_id
  - session_id
  - exp (5-10 min)
- Broker enforces single-session-per-user/challenge policy.

### Phase 3: Orchestrator + Isolation Hardening
- Per-container controls:
  - CPU/memory limits
  - pids limit
  - no-new-privileges
  - readonly rootfs where possible
  - seccomp/apparmor profile
- Per-user quotas and global queueing.
- TTL reaper and stuck-container collector.

### Phase 4: Recording + Replay
- Stream terminal input/output with timestamps to object storage.
- Store metadata in plugin tables.
- Add replay route + UI in plugin pages.

### Phase 5: Abuse Detection
- Detect and respond to:
  - excessive process spawn
  - network scan patterns
  - outbound abuse
- Automated actions:
  - terminate lab
  - cooldown/temporary ban signal into CTFd user flags

## Security Controls Checklist
- CTFd behind reverse proxy (TLS/HSTS/CSP/rate limits).
- Broker/orchestrator not exposed publicly except required paths.
- Internal service auth with mTLS or signed service tokens.
- Strict token TTL and audience checks.
- Audit logging for launch/terminate/connect/submit.

## Data Model Additions (Plugin)
- `lab_sessions`
  - id, user_id, team_id, challenge_id, container_id, status, created_at, expires_at
- `lab_events`
  - id, session_id, event_type, payload, created_at
- `lab_recordings`
  - id, session_id, object_key, checksum, created_at

## Operational Plan
- Add `docker-compose.ctfd-labs.yml` overlay with:
  - ctfd
  - redis
  - db
  - broker
  - orchestrator
  - optional minio
- Keep upstream CTFd `docker-compose.yml` compatible.

## Risks and Mitigations
- Risk: upstream merge conflicts if core files modified.
  - Mitigation: plugin-first architecture.
- Risk: container escape/abuse.
  - Mitigation: strict runtime profiles, quotas, monitoring.
- Risk: WS scale pressure.
  - Mitigation: sticky sessions + horizontal broker replicas.

## Immediate Next Tasks
1. Scaffold `CTFd/plugins/bastion_labs` with load/init and menu entry.
2. Add plugin migrations for `lab_sessions` and `lab_policies`.
3. Implement launch endpoint with stub orchestrator call.
4. Add challenge modal UI extension with Launch button and terminal panel.
5. Add signed token issuance/verification path between CTFd plugin and broker.

## Content Track Expansion Plan

### PowerShell Track
- Goal:
  - Add practical command-line and scripting challenges for offensive and defensive workflows.
- Scope:
  - Cmdlets, pipeline usage, object filtering, remoting basics, script execution policy concepts.
- Implementation:
  - Add PowerShell-tagged challenge set (`powershell`, `windows`, difficulty tags).
  - Use lab tasks that require command output validation and parsing.

### Windows Track
- Goal:
  - Add core Windows administration and incident-response style exercises.
- Scope:
  - Users/groups, services, scheduled tasks, event logs, filesystem ACLs, process inspection.
- Implementation:
  - Introduce Windows-compatible runtime profile metadata for challenge routing.
  - Define challenge categories like `Windows / Beginner`, `Windows / Advanced`.

### Nmap Track
- Goal:
  - Build network reconnaissance challenges that teach safe and structured scanning.
- Scope:
  - Host discovery, service/version detection, scripts, scan tuning and output interpretation.
- Implementation:
  - Include isolated target services in lab environments for realistic scan results.
  - Add anti-abuse limits for scan rate and destination scope.

### Wireshark Track
- Goal:
  - Add packet-analysis challenges from basic protocol identification to deeper forensic workflows.
- Scope:
  - Capture filtering, display filters, stream analysis, credential/artifact extraction.
- Implementation:
  - Provide pcap files as challenge assets and optional live-capture lab scenarios.
  - Add replayable “expected findings” hints with progressive unlock costs.

### Zeek Track
- Goal:
  - Add network security monitoring challenges using Zeek logs and detections.
- Scope:
  - `conn.log`, `dns.log`, `http.log` interpretation, anomaly triage, timeline correlation.
- Implementation:
  - Bundle curated Zeek log datasets per challenge.
  - Add scoring for multi-step investigations (partial progress where appropriate).

### cURL Track
- Goal:
  - Add HTTP/API interaction challenges emphasizing protocol fluency and request crafting.
- Scope:
  - Methods, headers, auth tokens, JSON payloads, cookies, redirects, response parsing.
- Implementation:
  - Provide intentionally vulnerable API endpoints in isolated lab containers.
  - Add rate limits and request telemetry for anti-automation controls.

## Phased Rollout For New Tracks
1. Phase A: Create category taxonomy and tags for all six tracks.
2. Phase B: Ship 5-10 starter challenges per track (Beginner/Intermediate mix).
3. Phase C: Add Advanced/Expert dynamic-scored challenges per track.
4. Phase D: Add track-specific analytics in admin panel (solve rates, fail patterns, time-to-solve).
