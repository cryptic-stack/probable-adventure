package sse

import (
	"context"
	"sort"
	"time"

	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
)

type EventStore interface {
	ListRecentEventsByRange(context.Context, int64, int32) ([]sqlc.Event, error)
	ListEventsAfterIDByRange(context.Context, int64, int64) ([]sqlc.Event, error)
}

func StreamRangeEvents(ctx context.Context, w FlushingResponseWriter, store EventStore, rangeID int64, pollInterval time.Duration) error {
	recent, err := store.ListRecentEventsByRange(ctx, rangeID, 50)
	if err == nil {
		sort.Slice(recent, func(i, j int) bool { return recent[i].ID < recent[j].ID })
		for _, e := range recent {
			if err := WriteEvent(w, "event", e); err != nil {
				return err
			}
		}
	}
	var lastID int64
	if len(recent) > 0 {
		lastID = recent[len(recent)-1].ID
	}

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			ev, err := store.ListEventsAfterIDByRange(ctx, rangeID, lastID)
			if err != nil {
				continue
			}
			for _, e := range ev {
				if err := WriteEvent(w, "event", e); err != nil {
					return err
				}
				if e.ID > lastID {
					lastID = e.ID
				}
			}
		}
	}
}
