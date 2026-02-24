# Roadmap

## Phase 1 (MVP)

- API: auth, challenge metadata, submit endpoint
- Orchestrator: spawn/destroy/TTL endpoints with Docker SDK
- Broker: basic WS terminal bridge and idle timeout
- Frontend: login, challenge page, terminal embed, timer
- DB schema migrations for users/challenges/containers/submissions

## Phase 2 (Security)

- Session recording pipeline to MinIO
- Abuse detection rules in broker/orchestrator
- Anti-cheat controls (single active session, submission throttles)
- Harden all inter-service links with mTLS

## Phase 3 (Advanced)

- Replay UI and terminal event timeline
- Team events and dynamic scoring controls
- Admin moderation dashboard with audit trails
- Optional Swarm-based worker scheduling

## Done criteria by phase

- Phase 1 done when end-to-end challenge solve works in browser only.
- Phase 2 done when abuse paths trigger automated containment.
- Phase 3 done when moderators can investigate and replay incidents quickly.
