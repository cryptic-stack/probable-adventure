package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

const claimNextJobSQL = `
WITH cte AS (
	SELECT id FROM jobs
	WHERE status='queued' AND attempts < max_attempts
	ORDER BY created_at
	FOR UPDATE SKIP LOCKED
	LIMIT 1
)
UPDATE jobs j
SET status='running', locked_by=$1, locked_at=now(), attempts=attempts+1, updated_at=now()
FROM cte
WHERE j.id = cte.id
RETURNING j.id, j.range_id, j.team_id, j.job_type, j.payload_json, j.attempts;
`

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

type ClaimedJob struct {
	ID       int64
	RangeID  int64
	TeamID   int64
	JobType  string
	Payload  json.RawMessage
	Attempts int32
}

func (s *Store) ClaimNextJob(ctx context.Context, workerID string) (*ClaimedJob, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var j ClaimedJob
	err = tx.QueryRow(ctx, claimNextJobSQL, workerID).Scan(&j.ID, &j.RangeID, &j.TeamID, &j.JobType, &j.Payload, &j.Attempts)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			_ = tx.Commit(ctx)
			return nil, nil
		}
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &j, nil
}

func (s *Store) CompleteJob(ctx context.Context, jobID int64) error {
	_, err := s.pool.Exec(ctx, `UPDATE jobs SET status='succeeded', updated_at=now(), error=NULL WHERE id=$1`, jobID)
	return err
}

func (s *Store) FailJob(ctx context.Context, jobID int64, msg string) error {
	_, err := s.pool.Exec(ctx, `UPDATE jobs SET status='failed', error=$2, updated_at=now() WHERE id=$1`, jobID, msg)
	return err
}

func (s *Store) UpdateRangeStatus(ctx context.Context, rangeID int64, status string, metadata json.RawMessage) error {
	_, err := s.pool.Exec(ctx, `UPDATE ranges SET status=$2, metadata_json=COALESCE($3, metadata_json), updated_at=now() WHERE id=$1`, rangeID, status, metadata)
	return err
}

func (s *Store) GetRangeTemplate(ctx context.Context, rangeID int64) (int64, json.RawMessage, error) {
	var templateID int64
	var def json.RawMessage
	err := s.pool.QueryRow(ctx, `SELECT t.id, t.definition_json
FROM ranges r JOIN templates t ON t.id = r.template_id WHERE r.id = $1`, rangeID).Scan(&templateID, &def)
	return templateID, def, err
}

func (s *Store) ReplaceRangeResources(ctx context.Context, rangeID int64, resources []Resource) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `DELETE FROM range_resources WHERE range_id=$1`, rangeID); err != nil {
		return err
	}
	for _, r := range resources {
		if _, err := tx.Exec(ctx, `INSERT INTO range_resources(range_id, resource_type, docker_id, service_name, metadata_json)
VALUES($1,$2,$3,$4,$5) ON CONFLICT (resource_type,docker_id) DO NOTHING`, rangeID, r.ResourceType, r.DockerID, r.ServiceName, r.Metadata); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) ListRangeResources(ctx context.Context, rangeID int64) ([]Resource, error) {
	rows, err := s.pool.Query(ctx, `SELECT resource_type, docker_id, COALESCE(service_name,''), metadata_json FROM range_resources WHERE range_id=$1`, rangeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Resource{}
	for rows.Next() {
		var r Resource
		if err := rows.Scan(&r.ResourceType, &r.DockerID, &r.ServiceName, &r.Metadata); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) PollInterval() time.Duration { return time.Second }

type Resource struct {
	ResourceType string
	DockerID     string
	ServiceName  string
	Metadata     json.RawMessage
}
