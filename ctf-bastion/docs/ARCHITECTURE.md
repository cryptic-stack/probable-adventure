# Architecture

## Components

- `nginx`: internet edge, reverse proxy, base WAF/rate limiting
- `api-java`: auth, RBAC, teams, submissions, admin APIs
- `broker-java`: browser WebSocket -> SSH broker for ephemeral labs
- `orchestrator-python`: Docker lifecycle orchestration and quotas
- `postgres`: primary relational store
- `redis`: token/session/cache/rate-limiter state
- `minio`: encrypted terminal session recording storage
- `lab-worker`: challenge execution node role (placeholder service in this scaffold)

## Session flow

1. User authenticates via `POST /api/auth/login`.
2. API issues short JWT access token (10-15 min) and refresh cookie.
3. User starts challenge.
4. API asks orchestrator to spawn ephemeral lab with strict runtime profile.
5. Frontend opens WebSocket to broker (`/ws/...`).
6. Broker attaches SSH stream to lab and proxies terminal I/O.
7. Broker logs encrypted input/output stream to MinIO.
8. Orchestrator destroys container on timeout, explicit stop, or abuse signal.

## Horizontal scaling

- Stateless API and broker scale behind Nginx upstreams.
- Redis stores shared session and anti-abuse counters.
- Docker lab workers are horizontal VM pool members.
- Optional migration path: Docker Swarm scheduling for workers only.

## Network boundaries

- `edge`: only public ingress (Nginx).
- `app`: internal app traffic.
- `data`: isolated data-plane traffic.
- `lab`: isolated challenge network plane.

## Production deployment model

- VM1: Nginx + API
- VM2: Broker
- VM3..VMn: Lab workers
- VMx: Postgres + Redis + MinIO (private subnet)

Use mTLS and host firewall rules between service tiers.
