package sse

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
	"net/http/httptest"
)

type fakeStore struct {
	mu       sync.Mutex
	recent   []sqlc.Event
	afterSeq [][]sqlc.Event
	calls    int
}

func (f *fakeStore) ListRecentEventsByRange(context.Context, int64, int32) ([]sqlc.Event, error) {
	return f.recent, nil
}

func (f *fakeStore) ListEventsAfterIDByRange(context.Context, int64, int64) ([]sqlc.Event, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.calls >= len(f.afterSeq) {
		return nil, nil
	}
	ev := f.afterSeq[f.calls]
	f.calls++
	return ev, nil
}

func mkEvent(id int64, msg string) sqlc.Event {
	return sqlc.Event{ID: id, RangeID: 1, Level: "info", Kind: "k", Message: msg, Payload: json.RawMessage(`{}`), CreatedAt: time.Now()}
}

func TestStreamRangeEventsReplayAndPoll(t *testing.T) {
	store := &fakeStore{
		recent: []sqlc.Event{mkEvent(2, "second"), mkEvent(1, "first")},
		afterSeq: [][]sqlc.Event{
			{mkEvent(3, "third")},
		},
	}
	rr := httptest.NewRecorder()
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(25 * time.Millisecond)
		cancel()
	}()
	err := StreamRangeEvents(ctx, rr, store, 1, 5*time.Millisecond)
	if err == nil {
		t.Fatalf("expected context cancellation error")
	}
	body := rr.Body.String()
	if !strings.Contains(body, "\"message\":\"first\"") || !strings.Contains(body, "\"message\":\"second\"") || !strings.Contains(body, "\"message\":\"third\"") {
		t.Fatalf("expected replay + polled events, got: %s", body)
	}
}
