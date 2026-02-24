# CTF Bastion (Docker/Compose, No Kubernetes)

This directory is a production-oriented scaffold for a browser-only public CTF platform using:

- Java 21 (`api-java`, `broker-java`)
- Python 3.12 (`orchestrator-python`)
- React + Vite (`frontend-react`)
- Docker Compose (Swarm optional later)
- Nginx edge proxy with hardening controls

## Architecture

Internet -> Nginx -> API/Broker/Frontend -> Postgres/Redis/MinIO + Lab workers

Detailed design docs:

- `docs/ARCHITECTURE.md`
- `docs/SECURITY-CHECKLIST.md`
- `docs/ROADMAP.md`
- `docs/ANTI-ABUSE.md`

## Quick start (scaffold mode)

1. Copy env:

```bash
cp .env.example .env
```

2. Build and run:

```bash
docker compose up -d --build
```

Optional Swarm scheduling overlay:

```bash
docker stack deploy -c docker-compose.yml -c docker-compose.swarm.yml ctf-bastion
```

3. Endpoints:

- Frontend: `http://localhost`
- API (proxied): `http://localhost/api`
- Broker WS (proxied): `ws://localhost/ws`

## Notes

- This scaffold includes a minimal orchestrator API and hardened infra defaults.
- Java services and React app are placeholders for your implementation.
- Use `docker-compose.swarm.yml` for optional replica scheduling.
