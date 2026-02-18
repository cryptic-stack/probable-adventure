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
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type rangeFakeRow struct {
	scan func(dest ...any) error
}

func (r rangeFakeRow) Scan(dest ...any) error { return r.scan(dest...) }

type rangeFakeDB struct {
	execCount int
	mode      string
}

func (f *rangeFakeDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	f.execCount++
	return pgconn.CommandTag{}, nil
}

func (f *rangeFakeDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, nil
}

func (f *rangeFakeDB) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	now := time.Now()
	switch {
	case strings.Contains(sql, "SELECT EXISTS(SELECT 1 FROM team_members"):
		return rangeFakeRow{scan: func(dest ...any) error {
			*(dest[0].(*bool)) = true
			return nil
		}}
	case strings.Contains(sql, "FROM templates WHERE id ="):
		return rangeFakeRow{scan: func(dest ...any) error {
			*(dest[0].(*int64)) = 3
			*(dest[1].(*string)) = "lab"
			*(dest[2].(*int32)) = 1
			*(dest[3].(*string)) = "Lab"
			*(dest[4].(*string)) = "desc"
			*(dest[5].(*json.RawMessage)) = json.RawMessage(`{"name":"linux-lab","services":[{"name":"web","image":"nginx"}]}`)
			*(dest[6].(*int32)) = 1
			*(dest[7].(*int64)) = 1
			*(dest[8].(*time.Time)) = now
			return nil
		}}
	case strings.Contains(sql, "SELECT COUNT(*)::bigint FROM ranges"):
		return rangeFakeRow{scan: func(dest ...any) error {
			if f.mode == "quota_exceeded" {
				*(dest[0].(*int64)) = 1
			} else {
				*(dest[0].(*int64)) = 0
			}
			return nil
		}}
	case strings.Contains(sql, "INSERT INTO ranges"):
		return rangeFakeRow{scan: func(dest ...any) error {
			*(dest[0].(*int64)) = 44
			*(dest[1].(*int64)) = args[0].(int64)
			*(dest[2].(*int64)) = args[1].(int64)
			*(dest[3].(*int64)) = args[2].(int64)
			*(dest[4].(*string)) = args[3].(string)
			*(dest[5].(*string)) = args[4].(string)
			*(dest[6].(*json.RawMessage)) = args[5].(json.RawMessage)
			*(dest[7].(*time.Time)) = now
			*(dest[8].(*time.Time)) = now
			return nil
		}}
	case strings.Contains(sql, "INSERT INTO jobs"):
		return rangeFakeRow{scan: func(dest ...any) error {
			*(dest[0].(*int64)) = 77
			*(dest[1].(*int64)) = args[0].(int64)
			*(dest[2].(*int64)) = args[1].(int64)
			*(dest[3].(*string)) = args[2].(string)
			*(dest[4].(*string)) = args[3].(string)
			*(dest[5].(*json.RawMessage)) = args[4].(json.RawMessage)
			*(dest[6].(*int32)) = 0
			*(dest[7].(*int32)) = 3
			*(dest[8].(**string)) = nil
			*(dest[9].(**time.Time)) = nil
			*(dest[10].(**string)) = nil
			*(dest[11].(*int64)) = args[5].(int64)
			*(dest[12].(*time.Time)) = now
			*(dest[13].(*time.Time)) = now
			return nil
		}}
	case strings.Contains(sql, "INSERT INTO events"):
		return rangeFakeRow{scan: func(dest ...any) error {
			*(dest[0].(*int64)) = 88
			*(dest[1].(*int64)) = args[0].(int64)
			*(dest[2].(**int64)) = args[1].(*int64)
			*(dest[3].(*string)) = args[2].(string)
			*(dest[4].(*string)) = args[3].(string)
			*(dest[5].(*string)) = args[4].(string)
			*(dest[6].(*json.RawMessage)) = args[5].(json.RawMessage)
			*(dest[7].(*time.Time)) = now
			return nil
		}}
	case strings.Contains(sql, "FROM ranges r JOIN team_members"):
		return rangeFakeRow{scan: func(dest ...any) error {
			*(dest[0].(*int64)) = 44
			*(dest[1].(*int64)) = 9
			*(dest[2].(*int64)) = 3
			*(dest[3].(*int64)) = 1
			*(dest[4].(*string)) = "r1"
			*(dest[5].(*string)) = "ready"
			*(dest[6].(*json.RawMessage)) = json.RawMessage(`{"ports":{}}`)
			*(dest[7].(*time.Time)) = now
			*(dest[8].(*time.Time)) = now
			return nil
		}}
	default:
		return rangeFakeRow{scan: func(dest ...any) error { return nil }}
	}
}

func reqWithUser(body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	return req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, sqlc.User{ID: 1, Role: "student", Email: "dev@example.com"}))
}

func TestCreateRangeCreatesQueuedJob(t *testing.T) {
	db := &rangeFakeDB{}
	q := sqlc.New(db)
	s := &Server{q: q, audit: audit.New(q)}
	req := reqWithUser(`{"team_id":9,"template_id":3,"name":"range-a"}`)
	rr := httptest.NewRecorder()

	s.createRange(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected %d got %d body=%s", http.StatusCreated, rr.Code, rr.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	job := out["job"].(map[string]any)
	rng := out["range"].(map[string]any)
	if job["status"] != "queued" || job["job_type"] != "provision" {
		t.Fatalf("expected queued provision job, got %#v", job)
	}
	if int(rng["id"].(float64)) != 44 {
		t.Fatalf("expected range id 44")
	}
	if db.execCount == 0 {
		t.Fatalf("expected audit log insert exec")
	}
}

func TestCreateRangeQuotaExceeded(t *testing.T) {
	db := &rangeFakeDB{mode: "quota_exceeded"}
	q := sqlc.New(db)
	s := &Server{q: q, audit: audit.New(q)}
	req := reqWithUser(`{"team_id":9,"template_id":3,"name":"range-a"}`)
	rr := httptest.NewRecorder()

	s.createRange(rr, req)

	if rr.Code != http.StatusConflict {
		t.Fatalf("expected %d got %d body=%s", http.StatusConflict, rr.Code, rr.Body.String())
	}
}

func TestDestroyRangeQueuesDestroyJob(t *testing.T) {
	db := &rangeFakeDB{}
	q := sqlc.New(db)
	s := &Server{q: q, audit: audit.New(q)}
	req := httptest.NewRequest(http.MethodPost, "/api/ranges/44/destroy", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "44")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, sqlc.User{ID: 1, Role: "student"}))
	rr := httptest.NewRecorder()

	s.destroyRange(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("expected %d got %d body=%s", http.StatusAccepted, rr.Code, rr.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if out["job_type"] != "destroy" || out["status"] != "queued" {
		t.Fatalf("expected queued destroy job, got %#v", out)
	}
}
