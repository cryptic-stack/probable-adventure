-- name: Ping :one
SELECT 1;

-- name: GetUserByEmail :one
SELECT id, email, name, role, created_at, updated_at FROM users WHERE email = $1;

-- name: CreateUser :one
INSERT INTO users (email, name, role) VALUES ($1, $2, $3)
RETURNING id, email, name, role, created_at, updated_at;

-- name: EnsureTeamExistsByName :exec
INSERT INTO teams(name) VALUES ($1) ON CONFLICT DO NOTHING;

-- name: AddUserToTeamByName :exec
INSERT INTO team_members(team_id, user_id, role)
SELECT t.id, $1, $2
FROM teams t
WHERE t.name = $3
ON CONFLICT (team_id, user_id) DO NOTHING;

-- name: ListTemplates :many
SELECT id, name, version, display_name, description, definition_json, quota, created_by, created_at
FROM templates ORDER BY created_at DESC;

-- name: GetTemplateByID :one
SELECT id, name, version, display_name, description, definition_json, quota, created_by, created_at
FROM templates WHERE id = $1;

-- name: GetLatestTemplateVersionByName :one
SELECT COALESCE(MAX(version), 0) FROM templates WHERE name = $1;

-- name: CreateTemplate :one
INSERT INTO templates (name, version, display_name, description, definition_json, quota, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, name, version, display_name, description, definition_json, quota, created_by, created_at;

-- name: CountActiveRangesForTeamTemplate :one
SELECT COUNT(*)::bigint FROM ranges
WHERE team_id = $1 AND template_id = $2 AND status IN ('pending','provisioning','ready','destroying');

-- name: CreateRange :one
INSERT INTO ranges (team_id, template_id, owner_user_id, name, status, metadata_json)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, team_id, template_id, owner_user_id, name, status, metadata_json, created_at, updated_at;

-- name: ListRangesForUser :many
SELECT r.id, r.team_id, r.template_id, r.owner_user_id, r.name, r.status, r.metadata_json, r.created_at, r.updated_at
FROM ranges r
JOIN team_members tm ON tm.team_id = r.team_id
WHERE tm.user_id = $1
ORDER BY r.created_at DESC;

-- name: GetRangeByIDForUser :one
SELECT r.id, r.team_id, r.template_id, r.owner_user_id, r.name, r.status, r.metadata_json, r.created_at, r.updated_at
FROM ranges r
JOIN team_members tm ON tm.team_id = r.team_id
WHERE r.id = $1 AND tm.user_id = $2;

-- name: TeamMembershipExists :one
SELECT EXISTS(
  SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2
);

-- name: ListRangeResources :many
SELECT resource_type, docker_id, COALESCE(service_name,''), metadata_json
FROM range_resources
WHERE range_id = $1
ORDER BY id ASC;

-- name: CreateJob :one
INSERT INTO jobs (range_id, team_id, job_type, status, payload_json, created_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, range_id, team_id, job_type, status, payload_json, attempts, max_attempts, locked_by, locked_at, error, created_by, created_at, updated_at;

-- name: InsertEvent :one
INSERT INTO events (range_id, job_id, level, kind, message, payload_json)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, range_id, job_id, level, kind, message, payload_json, created_at;

-- name: ListRecentEventsByRange :many
SELECT id, range_id, job_id, level, kind, message, payload_json, created_at
FROM events WHERE range_id = $1
ORDER BY created_at DESC LIMIT $2;

-- name: ListEventsAfterIDByRange :many
SELECT id, range_id, job_id, level, kind, message, payload_json, created_at
FROM events WHERE range_id = $1 AND id > $2
ORDER BY id ASC;

-- name: InsertAuditLog :exec
INSERT INTO audit_log (actor_user_id, team_id, range_id, action, details_json)
VALUES ($1, $2, $3, $4, $5);

-- name: ListRoomInstancesByRange :many
SELECT id, range_id, team_id, service_name, status, entry_path, settings_json, last_error, created_at, updated_at
FROM room_instances
WHERE range_id = $1
ORDER BY service_name ASC;

-- name: GetRoomInstanceByRangeService :one
SELECT id, range_id, team_id, service_name, status, entry_path, settings_json, last_error, created_at, updated_at
FROM room_instances
WHERE range_id = $1 AND service_name = $2;

-- name: UpsertRoomInstance :one
INSERT INTO room_instances (range_id, team_id, service_name, status, entry_path, settings_json, last_error)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (range_id, service_name)
DO UPDATE SET
  team_id = EXCLUDED.team_id,
  status = EXCLUDED.status,
  entry_path = EXCLUDED.entry_path,
  settings_json = EXCLUDED.settings_json,
  last_error = EXCLUDED.last_error,
  updated_at = now()
RETURNING id, range_id, team_id, service_name, status, entry_path, settings_json, last_error, created_at, updated_at;

-- name: UpdateRoomInstanceSettings :one
UPDATE room_instances
SET settings_json = $3, updated_at = now()
WHERE range_id = $1 AND service_name = $2
RETURNING id, range_id, team_id, service_name, status, entry_path, settings_json, last_error, created_at, updated_at;

-- name: DeleteRoomInstancesByRange :exec
DELETE FROM room_instances WHERE range_id = $1;
