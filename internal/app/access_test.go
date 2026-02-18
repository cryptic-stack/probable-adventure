package app

import (
	"encoding/json"
	"strings"
	"testing"
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
	links := buildRangeAccessLinks(9, meta, def, "Dev User")
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

