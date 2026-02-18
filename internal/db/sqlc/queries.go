package sqlc

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type DBTX interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

type Queries struct {
	db DBTX
}

func New(db DBTX) *Queries {
	return &Queries{db: db}
}

type User struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Template struct {
	ID          int64           `json:"id"`
	Name        string          `json:"name"`
	Version     int32           `json:"version"`
	DisplayName string          `json:"display_name"`
	Description string          `json:"description"`
	Definition  json.RawMessage `json:"definition_json"`
	Quota       int32           `json:"quota"`
	CreatedBy   int64           `json:"created_by"`
	CreatedAt   time.Time       `json:"created_at"`
}

type Range struct {
	ID         int64           `json:"id"`
	TeamID     int64           `json:"team_id"`
	TemplateID int64           `json:"template_id"`
	OwnerUser  int64           `json:"owner_user_id"`
	Name       string          `json:"name"`
	Status     string          `json:"status"`
	Metadata   json.RawMessage `json:"metadata_json"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

type Job struct {
	ID          int64           `json:"id"`
	RangeID     int64           `json:"range_id"`
	TeamID      int64           `json:"team_id"`
	JobType     string          `json:"job_type"`
	Status      string          `json:"status"`
	Payload     json.RawMessage `json:"payload_json"`
	Attempts    int32           `json:"attempts"`
	MaxAttempts int32           `json:"max_attempts"`
	LockedBy    *string         `json:"locked_by"`
	LockedAt    *time.Time      `json:"locked_at"`
	Error       *string         `json:"error"`
	CreatedBy   int64           `json:"created_by"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type Event struct {
	ID        int64           `json:"id"`
	RangeID   int64           `json:"range_id"`
	JobID     *int64          `json:"job_id"`
	Level     string          `json:"level"`
	Kind      string          `json:"kind"`
	Message   string          `json:"message"`
	Payload   json.RawMessage `json:"payload_json"`
	CreatedAt time.Time       `json:"created_at"`
}

type RangeResource struct {
	ResourceType string          `json:"resource_type"`
	DockerID     string          `json:"docker_id"`
	ServiceName  string          `json:"service_name"`
	Metadata     json.RawMessage `json:"metadata_json"`
}

func (q *Queries) Ping(ctx context.Context) error {
	var n int
	if err := q.db.QueryRow(ctx, "SELECT 1").Scan(&n); err != nil {
		return err
	}
	if n != 1 {
		return errors.New("db ping failed")
	}
	return nil
}

func (q *Queries) TeamMembershipExists(ctx context.Context, userID, teamID int64) (bool, error) {
	var ok bool
	err := q.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2)`, userID, teamID).Scan(&ok)
	return ok, err
}

func (q *Queries) ListRangeResources(ctx context.Context, rangeID int64) ([]RangeResource, error) {
	rows, err := q.db.Query(ctx, `SELECT resource_type, docker_id, COALESCE(service_name,''), metadata_json
FROM range_resources
WHERE range_id = $1
ORDER BY id ASC`, rangeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RangeResource{}
	for rows.Next() {
		var rr RangeResource
		if err := rows.Scan(&rr.ResourceType, &rr.DockerID, &rr.ServiceName, &rr.Metadata); err != nil {
			return nil, err
		}
		out = append(out, rr)
	}
	return out, rows.Err()
}

func (q *Queries) GetUserByEmail(ctx context.Context, email string) (User, error) {
	var u User
	err := q.db.QueryRow(ctx, `SELECT id, email, name, role, created_at, updated_at FROM users WHERE email = $1`, email).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

func (q *Queries) CreateUser(ctx context.Context, email, name, role string) (User, error) {
	var u User
	err := q.db.QueryRow(ctx, `INSERT INTO users (email, name, role) VALUES ($1, $2, $3)
RETURNING id, email, name, role, created_at, updated_at`, email, name, role).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

func (q *Queries) EnsureTeamExistsByName(ctx context.Context, name string) error {
	_, err := q.db.Exec(ctx, `INSERT INTO teams(name) VALUES ($1) ON CONFLICT DO NOTHING`, name)
	return err
}

func (q *Queries) AddUserToTeamByName(ctx context.Context, userID int64, role, teamName string) error {
	_, err := q.db.Exec(ctx, `INSERT INTO team_members(team_id, user_id, role)
SELECT t.id, $1, $2
FROM teams t
WHERE t.name = $3
ON CONFLICT (team_id, user_id) DO NOTHING`, userID, role, teamName)
	return err
}

func (q *Queries) ListTemplates(ctx context.Context) ([]Template, error) {
	rows, err := q.db.Query(ctx, `SELECT id, name, version, display_name, description, definition_json, quota, created_by, created_at FROM templates ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Template, 0)
	for rows.Next() {
		var t Template
		if err := rows.Scan(&t.ID, &t.Name, &t.Version, &t.DisplayName, &t.Description, &t.Definition, &t.Quota, &t.CreatedBy, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (q *Queries) GetTemplateByID(ctx context.Context, id int64) (Template, error) {
	var t Template
	err := q.db.QueryRow(ctx, `SELECT id, name, version, display_name, description, definition_json, quota, created_by, created_at FROM templates WHERE id = $1`, id).
		Scan(&t.ID, &t.Name, &t.Version, &t.DisplayName, &t.Description, &t.Definition, &t.Quota, &t.CreatedBy, &t.CreatedAt)
	return t, err
}

func (q *Queries) GetLatestTemplateVersionByName(ctx context.Context, name string) (int32, error) {
	var v int32
	err := q.db.QueryRow(ctx, `SELECT COALESCE(MAX(version), 0) FROM templates WHERE name = $1`, name).Scan(&v)
	return v, err
}

func (q *Queries) CreateTemplate(ctx context.Context, name string, version int32, displayName, description string, definition json.RawMessage, quota int32, createdBy int64) (Template, error) {
	var t Template
	err := q.db.QueryRow(ctx, `INSERT INTO templates (name, version, display_name, description, definition_json, quota, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, name, version, display_name, description, definition_json, quota, created_by, created_at`,
		name, version, displayName, description, definition, quota, createdBy).
		Scan(&t.ID, &t.Name, &t.Version, &t.DisplayName, &t.Description, &t.Definition, &t.Quota, &t.CreatedBy, &t.CreatedAt)
	return t, err
}

func (q *Queries) CountActiveRangesForTeamTemplate(ctx context.Context, teamID, templateID int64) (int64, error) {
	var c int64
	err := q.db.QueryRow(ctx, `SELECT COUNT(*)::bigint FROM ranges WHERE team_id = $1 AND template_id = $2 AND status IN ('pending','provisioning','ready','destroying')`, teamID, templateID).Scan(&c)
	return c, err
}

func (q *Queries) CreateRange(ctx context.Context, teamID, templateID, ownerUserID int64, name, status string, metadata json.RawMessage) (Range, error) {
	var r Range
	err := q.db.QueryRow(ctx, `INSERT INTO ranges (team_id, template_id, owner_user_id, name, status, metadata_json)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, team_id, template_id, owner_user_id, name, status, metadata_json, created_at, updated_at`, teamID, templateID, ownerUserID, name, status, metadata).
		Scan(&r.ID, &r.TeamID, &r.TemplateID, &r.OwnerUser, &r.Name, &r.Status, &r.Metadata, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

func (q *Queries) ListRangesForUser(ctx context.Context, userID int64) ([]Range, error) {
	rows, err := q.db.Query(ctx, `SELECT r.id, r.team_id, r.template_id, r.owner_user_id, r.name, r.status, r.metadata_json, r.created_at, r.updated_at
FROM ranges r JOIN team_members tm ON tm.team_id = r.team_id WHERE tm.user_id = $1 ORDER BY r.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Range{}
	for rows.Next() {
		var r Range
		if err := rows.Scan(&r.ID, &r.TeamID, &r.TemplateID, &r.OwnerUser, &r.Name, &r.Status, &r.Metadata, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (q *Queries) GetRangeByIDForUser(ctx context.Context, id, userID int64) (Range, error) {
	var r Range
	err := q.db.QueryRow(ctx, `SELECT r.id, r.team_id, r.template_id, r.owner_user_id, r.name, r.status, r.metadata_json, r.created_at, r.updated_at
FROM ranges r JOIN team_members tm ON tm.team_id = r.team_id WHERE r.id = $1 AND tm.user_id = $2`, id, userID).
		Scan(&r.ID, &r.TeamID, &r.TemplateID, &r.OwnerUser, &r.Name, &r.Status, &r.Metadata, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

func (q *Queries) CreateJob(ctx context.Context, rangeID, teamID int64, jobType, status string, payload json.RawMessage, createdBy int64) (Job, error) {
	var j Job
	err := q.db.QueryRow(ctx, `INSERT INTO jobs (range_id, team_id, job_type, status, payload_json, created_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, range_id, team_id, job_type, status, payload_json, attempts, max_attempts, locked_by, locked_at, error, created_by, created_at, updated_at`,
		rangeID, teamID, jobType, status, payload, createdBy).
		Scan(&j.ID, &j.RangeID, &j.TeamID, &j.JobType, &j.Status, &j.Payload, &j.Attempts, &j.MaxAttempts, &j.LockedBy, &j.LockedAt, &j.Error, &j.CreatedBy, &j.CreatedAt, &j.UpdatedAt)
	return j, err
}

func (q *Queries) InsertEvent(ctx context.Context, rangeID int64, jobID *int64, level, kind, message string, payload json.RawMessage) (Event, error) {
	var e Event
	err := q.db.QueryRow(ctx, `INSERT INTO events (range_id, job_id, level, kind, message, payload_json)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, range_id, job_id, level, kind, message, payload_json, created_at`, rangeID, jobID, level, kind, message, payload).
		Scan(&e.ID, &e.RangeID, &e.JobID, &e.Level, &e.Kind, &e.Message, &e.Payload, &e.CreatedAt)
	return e, err
}

func (q *Queries) ListRecentEventsByRange(ctx context.Context, rangeID int64, lim int32) ([]Event, error) {
	rows, err := q.db.Query(ctx, `SELECT id, range_id, job_id, level, kind, message, payload_json, created_at FROM events WHERE range_id = $1 ORDER BY created_at DESC LIMIT $2`, rangeID, lim)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.RangeID, &e.JobID, &e.Level, &e.Kind, &e.Message, &e.Payload, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (q *Queries) ListEventsAfterIDByRange(ctx context.Context, rangeID, afterID int64) ([]Event, error) {
	rows, err := q.db.Query(ctx, `SELECT id, range_id, job_id, level, kind, message, payload_json, created_at FROM events WHERE range_id = $1 AND id > $2 ORDER BY id ASC`, rangeID, afterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.RangeID, &e.JobID, &e.Level, &e.Kind, &e.Message, &e.Payload, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (q *Queries) InsertAuditLog(ctx context.Context, actorUserID int64, teamID, rangeID *int64, action string, details json.RawMessage) error {
	_, err := q.db.Exec(ctx, `INSERT INTO audit_log (actor_user_id, team_id, range_id, action, details_json) VALUES ($1, $2, $3, $4, $5)`, actorUserID, teamID, rangeID, action, details)
	return err
}
