package sqlc

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeRow struct {
	scan func(dest ...any) error
}

func (r fakeRow) Scan(dest ...any) error {
	return r.scan(dest...)
}

type fakeDB struct {
	queryRow func(ctx context.Context, sql string, args ...any) pgx.Row
}

func (f fakeDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (f fakeDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("not implemented")
}

func (f fakeDB) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return f.queryRow(ctx, sql, args...)
}

func TestPingOK(t *testing.T) {
	q := New(fakeDB{queryRow: func(ctx context.Context, sql string, args ...any) pgx.Row {
		return fakeRow{scan: func(dest ...any) error {
			p, ok := dest[0].(*int)
			if !ok {
				t.Fatalf("expected *int destination")
			}
			*p = 1
			return nil
		}}
	}})
	if err := q.Ping(context.Background()); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

func TestPingFailure(t *testing.T) {
	q := New(fakeDB{queryRow: func(ctx context.Context, sql string, args ...any) pgx.Row {
		return fakeRow{scan: func(dest ...any) error { return errors.New("db down") }}
	}})
	if err := q.Ping(context.Background()); err == nil {
		t.Fatalf("expected error")
	}
}
