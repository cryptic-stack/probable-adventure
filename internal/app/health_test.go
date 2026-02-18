package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type healthFakeRow struct {
	scan func(dest ...any) error
}

func (r healthFakeRow) Scan(dest ...any) error { return r.scan(dest...) }

type healthFakeDB struct {
	err error
}

func (f healthFakeDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (f healthFakeDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("not implemented")
}

func (f healthFakeDB) QueryRow(context.Context, string, ...any) pgx.Row {
	if f.err != nil {
		return healthFakeRow{scan: func(dest ...any) error { return f.err }}
	}
	return healthFakeRow{scan: func(dest ...any) error {
		*(dest[0].(*int)) = 1
		return nil
	}}
}

func TestHandleHealthOK(t *testing.T) {
	s := &Server{q: sqlc.New(healthFakeDB{})}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/healthz", nil)
	s.handleHealth(rr, req)
	if rr.Code != 200 {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if body["status"] != "ok" || body["db"] != "ok" {
		t.Fatalf("unexpected body: %+v", body)
	}
}

func TestHandleHealthDegraded(t *testing.T) {
	s := &Server{q: sqlc.New(healthFakeDB{err: errors.New("db down")})}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/healthz", nil)
	s.handleHealth(rr, req)
	if rr.Code != 200 {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if body["status"] != "degraded" || body["db"] != "error" {
		t.Fatalf("unexpected body: %+v", body)
	}
}
