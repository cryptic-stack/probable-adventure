package audit

import (
	"context"
	"encoding/json"

	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
)

type Logger struct {
	q *sqlc.Queries
}

func New(q *sqlc.Queries) *Logger {
	return &Logger{q: q}
}

func (l *Logger) Log(ctx context.Context, actorUserID int64, teamID, rangeID *int64, action string, details map[string]any) {
	b, _ := json.Marshal(details)
	_ = l.q.InsertAuditLog(ctx, actorUserID, teamID, rangeID, action, b)
}
