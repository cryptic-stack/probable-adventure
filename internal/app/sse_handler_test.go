package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/cryptic-stack/probable-adventure/internal/auth"
	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type sseFakeRow struct{ scan func(dest ...any) error }

func (r sseFakeRow) Scan(dest ...any) error { return r.scan(dest...) }

type sseFakeDB struct{}

func (sseFakeDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (sseFakeDB) Query(context.Context, string, ...any) (pgx.Rows, error) { return nil, nil }

func (sseFakeDB) QueryRow(context.Context, string, ...any) pgx.Row {
	return sseFakeRow{scan: func(dest ...any) error { return pgx.ErrNoRows }}
}

func TestStreamRangeEventsMembershipDenied(t *testing.T) {
	s := &Server{q: sqlc.New(sseFakeDB{}), poll: 5}
	req := httptest.NewRequest(http.MethodGet, "/api/ranges/123/events", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "123")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, sqlc.User{ID: 1}))
	rr := httptest.NewRecorder()

	s.streamRangeEvents(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rr.Code)
	}
}
