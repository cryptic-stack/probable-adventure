# probable-adventure

MVP cyber range dashboard + provisioner.

## Stack
- Go + chi
- PostgreSQL + pgx + sqlc-style query layer
- golang-migrate
- Docker Engine API via Docker Go SDK
- SSE for live events

## Phase 0 Status
- Repo scaffolded with required directories (`cmd`, `internal`, `migrations`, `sqlc`, `web`)
- Docker Compose added for `postgres`, `api`, `provisioner` (`pgadmin` optional via profile)
- `make dev` starts services in detached mode

## Phase 1 Status
- Initial schema migration implemented: `users`, `teams`, `team_members`, `templates`, `ranges`, `range_resources`, `jobs`, `events`, `audit_log`
- Indexes added for key lookup paths
- DB pool setup added in `internal/db/db.go`
- API health endpoint checks DB connectivity: `GET /healthz`
- Core DB operations defined in `sqlc/queries.sql`

## Phase 2 Status
- Google OIDC login/callback/session implemented:
  - `GET /auth/google/login`
  - `GET /auth/google/callback`
  - `POST /auth/logout`
- Dev auth bypass implemented with `DEV_AUTH_EMAIL`
- Session cookie auth implemented (HTTP-only; `Secure` outside dev)
- First login creates user with default `student` role, or `admin` when email is in `ADMIN_EMAILS`
- RBAC middleware implemented for `admin|instructor|student`
- `GET /api/me` returns authenticated user

## Phase 3 Status
- Templates API implemented:
  - `POST /api/templates` (admin only)
  - `GET /api/templates`
  - `GET /api/templates/{id}`
- `definition_json` is validated for required shape/fields
- `(name, version)` uniqueness enforced in DB
- Template version auto-increments on create when name already exists

## Phase 4 Status
- Ranges + jobs API implemented:
  - `POST /api/ranges` creates a range (`status=pending`) and enqueues a `provision` job (`status=queued`)
  - `GET /api/ranges` lists ranges scoped by team membership
  - `GET /api/ranges/{id}` returns range + resources
  - `POST /api/ranges/{id}/destroy` enqueues `destroy` job
  - `POST /api/ranges/{id}/reset` enqueues `reset` job
- Quota check enforced at API layer via template quota
- Audit logging for template create, range create/destroy/reset actions

## Phase 5 Status
- SSE events endpoint implemented: `GET /api/ranges/{id}/events`
- On connect, API replays last 50 range events from DB
- API polls DB every 1 second and streams newly inserted events
- Membership is enforced before SSE stream starts
- Provisioner emits major lifecycle events into `events` table

## Phase 6 Status
- Provisioner worker queue loop uses Postgres claim with `FOR UPDATE SKIP LOCKED`
- Job status lifecycle handled: `queued -> running -> succeeded|failed`, with attempts + lock metadata
- Provision logic:
  - idempotent label-based discovery/reuse of network/containers
  - Docker labels applied to every resource: `range_id`, `team_id`, `template_id`, `service_name`
  - image pull + container start + health check wait
  - `range_resources` refreshed from discovered/provisioned resources
  - range status set to `ready` on success
- Destroy logic:
  - prefers Docker label queries (`range_id`) to find/remove resources
  - clears `range_resources`
  - range status set to `destroyed`
- Reset logic:
  - destroy then provision in worker
- Events emitted for major provision/destroy steps

## Phase 7 Status
- Minimal web UI implemented and served by API:
  - `GET /` serves `web/index.html`
  - `GET /web/app.js`
- Dashboard supports:
  - login/logout actions
  - template listing and quick template selection for range creation
  - range creation and range listing
  - range detail with port mapping view
  - destroy/reset actions
  - live SSE event log per selected range

## Quick Start
1. Create a `.env` file (example below).
2. Start the stack: `make dev`
3. Run migrations: `make migrate-up`
4. Tail logs: `make logs`
5. Stop and clean volumes: `make down`

If `make` is not installed on your machine (common on Windows), run the equivalent command directly:
`docker compose up -d --build`

## Env Example
```env
APP_ENV=dev
HTTP_ADDR=:8080
DATABASE_URL=postgres://range:range@localhost:5432/rangedb?sslmode=disable
SESSION_KEY=dev-insecure-session-key-change-me
DEV_AUTH_EMAIL=dev@example.com
ADMIN_EMAILS=dev@example.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URL=http://localhost:8080/auth/google/callback
WORKER_ID=provisioner-1
DOCKER_HOST=unix:///var/run/docker.sock
```

## Notes
- `DEV_AUTH_EMAIL` enables local auth bypass (no OIDC redirect required).
- OIDC is active only when all Google OIDC env vars are set.

## Verify Phase 1
1. Start services: `make dev`
2. Apply migration: `make migrate-up`
3. Check health:
   `curl http://localhost:8080/healthz`
4. Expected JSON:
   `{\"status\":\"ok\",\"db\":\"ok\"}`

## Verify Phase 2
1. Dev bypass:
   set `DEV_AUTH_EMAIL=dev@example.com`
2. Start API and open:
   `curl http://localhost:8080/api/me`
3. Expected:
   user JSON for `dev@example.com`
4. OIDC:
   unset `DEV_AUTH_EMAIL`, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`
5. Open `http://localhost:8080/auth/google/login`, complete Google auth, then call:
   `curl --cookie-jar cookies.txt --cookie cookies.txt http://localhost:8080/api/me`

## Verify Phase 3
1. Ensure authenticated admin context (for local dev: `DEV_AUTH_EMAIL` in `ADMIN_EMAILS`)
2. Create template:
   `curl -X POST http://localhost:8080/api/templates -H "Content-Type: application/json" -d "{\"name\":\"lab\",\"display_name\":\"Lab\",\"description\":\"Demo\",\"quota\":2,\"definition_json\":{\"name\":\"linux-lab\",\"services\":[{\"name\":\"web\",\"image\":\"nginx:alpine\",\"ports\":[{\"container\":80,\"host\":0}]}]}}"`
3. List templates:
   `curl http://localhost:8080/api/templates`
4. Fetch by id:
   `curl http://localhost:8080/api/templates/1`

## Verify Phase 4
1. Create a range:
   `curl -X POST http://localhost:8080/api/ranges -H "Content-Type: application/json" -d "{\"team_id\":1,\"template_id\":1,\"name\":\"range-a\"}"`
2. Confirm list:
   `curl http://localhost:8080/api/ranges`
3. Confirm detail:
   `curl http://localhost:8080/api/ranges/1`
4. Queue destroy:
   `curl -X POST http://localhost:8080/api/ranges/1/destroy`
5. Queue reset:
   `curl -X POST http://localhost:8080/api/ranges/1/reset`

## Verify Phase 5
1. Open stream:
   `curl -N http://localhost:8080/api/ranges/1/events`
2. In another shell, trigger action (example):
   `curl -X POST http://localhost:8080/api/ranges/1/reset`
3. Confirm stream receives historical + new events (`job.queued`, `provision.*`, `destroy.*`)

## Verify Phase 6
1. Create range:
   `curl -X POST http://localhost:8080/api/ranges -H "Content-Type: application/json" -d "{\"team_id\":1,\"template_id\":1,\"name\":\"range-worker\"}"`
2. Check job transitions:
   `docker compose exec -T postgres psql -U range -d rangedb -c "select id,job_type,status,attempts from jobs order by id desc limit 5;"`
3. Check range status/resources:
   `curl http://localhost:8080/api/ranges`
   and
   `docker compose exec -T postgres psql -U range -d rangedb -c "select range_id,resource_type,docker_id,service_name from range_resources order by id desc limit 10;"`
4. Destroy and verify cleanup:
   `curl -X POST http://localhost:8080/api/ranges/1/destroy`

## Verify Phase 7
1. Open browser at `http://localhost:8080/`
2. Confirm user identity is shown (`/api/me`)
3. Create a range from the UI (team/template inputs)
4. Select a range in the list and verify:
   - detail JSON loads
   - port mappings are displayed
   - SSE event log updates live
5. Use destroy/reset buttons and observe queued jobs/events

## Endpoints
- `GET /healthz`
- `GET /api/me`
- `POST /api/templates`
- `GET /api/templates`
- `POST /api/ranges`
- `GET /api/ranges`
- `GET /api/ranges/{id}/events`
