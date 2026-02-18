package jobs

import (
	"strings"
	"testing"
	"time"
)

func TestClaimNextJobSQLUsesSkipLocked(t *testing.T) {
	sql := strings.ToUpper(claimNextJobSQL)
	if !strings.Contains(sql, "FOR UPDATE SKIP LOCKED") {
		t.Fatalf("expected SKIP LOCKED in claim query")
	}
	if !strings.Contains(sql, "ATTEMPTS=ATTEMPTS+1") {
		t.Fatalf("expected attempts increment in claim query")
	}
	if !strings.Contains(sql, "STATUS='RUNNING'") {
		t.Fatalf("expected status transition to running")
	}
}

func TestPollInterval(t *testing.T) {
	s := &Store{}
	if s.PollInterval() != time.Second {
		t.Fatalf("expected 1s poll interval")
	}
}
