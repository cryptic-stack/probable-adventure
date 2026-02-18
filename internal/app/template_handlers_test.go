package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/cryptic-stack/probable-adventure/internal/audit"
	"github.com/cryptic-stack/probable-adventure/internal/auth"
	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type tplFakeRow struct {
	scan func(dest ...any) error
}

func (r tplFakeRow) Scan(dest ...any) error { return r.scan(dest...) }

type tplFakeDB struct{}

func (tplFakeDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (tplFakeDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, nil
}

func (tplFakeDB) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if strings.Contains(sql, "COALESCE(MAX(version), 0)") {
		return tplFakeRow{scan: func(dest ...any) error {
			*(dest[0].(*int32)) = 2
			return nil
		}}
	}
	if strings.Contains(sql, "INSERT INTO templates") {
		return tplFakeRow{scan: func(dest ...any) error {
			now := time.Now()
			*(dest[0].(*int64)) = 10
			*(dest[1].(*string)) = args[0].(string)
			*(dest[2].(*int32)) = args[1].(int32)
			*(dest[3].(*string)) = args[2].(string)
			*(dest[4].(*string)) = args[3].(string)
			*(dest[5].(*json.RawMessage)) = args[4].(json.RawMessage)
			*(dest[6].(*int32)) = args[5].(int32)
			*(dest[7].(*int64)) = args[6].(int64)
			*(dest[8].(*time.Time)) = now
			return nil
		}}
	}
	if strings.Contains(sql, "INSERT INTO audit_log") {
		return tplFakeRow{scan: func(dest ...any) error { return nil }}
	}
	return tplFakeRow{scan: func(dest ...any) error { return nil }}
}

func TestCreateTemplateIncrementsVersion(t *testing.T) {
	q := sqlc.New(tplFakeDB{})
	s := &Server{q: q, audit: audit.New(q)}
	body := `{"name":"lab","display_name":"Lab","description":"desc","quota":2,"definition_json":{"name":"linux-lab","services":[{"name":"web","image":"nginx:alpine","ports":[{"container":80,"host":0}]}]}}`
	req := httptest.NewRequest(http.MethodPost, "/api/templates", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, sqlc.User{ID: 1, Role: "admin"}))
	rr := httptest.NewRecorder()

	s.createTemplate(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if got := int(out["version"].(float64)); got != 3 {
		t.Fatalf("expected version 3, got %d", got)
	}
}
