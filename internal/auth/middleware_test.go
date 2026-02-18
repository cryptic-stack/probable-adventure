package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/cryptic-stack/probable-adventure/internal/config"
	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeRow struct {
	scan func(dest ...any) error
}

func (r fakeRow) Scan(dest ...any) error { return r.scan(dest...) }

type fakeDB struct {
	queryRow func(ctx context.Context, sql string, args ...any) pgx.Row
	exec     func(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func (f fakeDB) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if f.exec != nil {
		return f.exec(ctx, sql, args...)
	}
	return pgconn.CommandTag{}, nil
}

func (f fakeDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("not implemented")
}

func (f fakeDB) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if f.queryRow != nil {
		return f.queryRow(ctx, sql, args...)
	}
	return fakeRow{scan: func(dest ...any) error { return errors.New("unexpected query") }}
}

func TestRequireUser(t *testing.T) {
	h := RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected %d, got %d", http.StatusUnauthorized, rr.Code)
	}
}

func TestUserMiddlewareDevAuthUsesExistingUser(t *testing.T) {
	cfg := config.Config{DevAuthEmail: "dev@example.com", AdminEmails: map[string]struct{}{}}
	mgr := &Manager{}
	q := sqlc.New(fakeDB{queryRow: func(ctx context.Context, sql string, args ...any) pgx.Row {
		if len(args) == 1 {
			return fakeRow{scan: func(dest ...any) error {
				*(dest[0].(*int64)) = 7
				*(dest[1].(*string)) = "dev@example.com"
				*(dest[2].(*string)) = "dev"
				*(dest[3].(*string)) = "student"
				now := time.Now()
				*(dest[4].(*time.Time)) = now
				*(dest[5].(*time.Time)) = now
				return nil
			}}
		}
		return fakeRow{scan: func(dest ...any) error { return errors.New("unexpected query") }}
	}})

	called := false
	h := UserMiddleware(cfg, mgr, q)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if u, ok := CurrentUser(r); !ok || u.Email != "dev@example.com" {
			t.Fatalf("expected authenticated user in context")
		}
		w.WriteHeader(http.StatusOK)
	}))

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	h.ServeHTTP(rr, req)
	if !called {
		t.Fatalf("expected next handler to be called")
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
	}
}
