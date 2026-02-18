package app

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
)

func TestPreferredHostPortPrefers8080TCP(t *testing.T) {
	svc := map[string][]hostBinding{
		"52000/udp": {{HostPort: "51000"}},
		"8080/tcp":  {{HostPort: "30001"}},
		"80/tcp":    {{HostPort: "30002"}},
	}
	got := preferredHostPort(svc)
	if got != "30001" {
		t.Fatalf("expected 30001, got %q", got)
	}
}

func TestBuildRangeAccessLinksOnePerService(t *testing.T) {
	meta := json.RawMessage(`{"ports":{"desktop":{"8080/tcp":[{"HostIp":"0.0.0.0","HostPort":"40001"}],"52000/udp":[{"HostIp":"0.0.0.0","HostPort":"40002"}]},"web":{"80/tcp":[{"HostIp":"0.0.0.0","HostPort":"40003"}]}}}`)
	def := json.RawMessage(`{"name":"x","room":{"user_pass":"neko"},"services":[{"name":"desktop","image":"x"},{"name":"web","image":"y"}]}`)
	links := buildRangeAccessLinks(9, meta, def, nil, "Dev User")
	if len(links) != 2 {
		t.Fatalf("expected 2 links, got %d", len(links))
	}
	for _, l := range links {
		if !strings.Contains(l.URL, "/api/ranges/9/access/") {
			t.Fatalf("unexpected url: %s", l.URL)
		}
		if !strings.Contains(l.URL, "usr=Dev-User") {
			t.Fatalf("expected usr query in %s", l.URL)
		}
		if !strings.Contains(l.URL, "pwd=neko") {
			t.Fatalf("expected pwd query in %s", l.URL)
		}
	}
}

func TestBuildRangeAccessLinksUsesRoomInstancePathAndPassword(t *testing.T) {
	meta := json.RawMessage(`{"ports":{"desktop":{"8080/tcp":[{"HostIp":"0.0.0.0","HostPort":"40001"}]}}}`)
	def := json.RawMessage(`{"name":"x","room":{"user_pass":"neko"}}`)
	rooms := []sqlc.RoomInstance{
		{
			ServiceName: "desktop",
			EntryPath:   "/api/ranges/9/access/desktop/",
			Settings:    json.RawMessage(`{"user_pass":"override"}`),
		},
	}
	links := buildRangeAccessLinks(9, meta, def, rooms, "dev")
	if len(links) != 1 {
		t.Fatalf("expected 1 link, got %d", len(links))
	}
	if links[0].URL != "/api/ranges/9/access/desktop/?pwd=override&usr=dev" {
		t.Fatalf("unexpected url: %s", links[0].URL)
	}
}
