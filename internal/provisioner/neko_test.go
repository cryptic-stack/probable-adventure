package provisioner

import (
	"testing"

	tmpl "github.com/cryptic-stack/probable-adventure/internal/templates"
)

func TestBuildServiceEnvFromRoomOptions(t *testing.T) {
	trueVal := true
	def := tmpl.Definition{
		Room: tmpl.RoomOptions{
			UserPass:          "u1",
			AdminPass:         "a1",
			MaxConnections:    7,
			ControlProtection: &trueVal,
		},
	}
	svc := tmpl.Service{
		Env: []string{
			"NEKO_MEMBER_MULTIUSER_USER_PASSWORD=override",
			"CUSTOM=1",
		},
	}
	got := buildServiceEnv(def, svc)
	joined := map[string]string{}
	for _, kv := range got {
		k := kv
		v := ""
		if i := len(kv); i > 0 {
			for j := 0; j < len(kv); j++ {
				if kv[j] == '=' {
					k = kv[:j]
					v = kv[j+1:]
					break
				}
			}
		}
		joined[k] = v
	}
	if joined["NEKO_MEMBER_MULTIUSER_USER_PASSWORD"] != "override" {
		t.Fatalf("expected override user password, got %q", joined["NEKO_MEMBER_MULTIUSER_USER_PASSWORD"])
	}
	if joined["NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD"] != "a1" {
		t.Fatalf("expected room admin password")
	}
	if joined["NEKO_SERVER_CONCURRENCY"] != "7" {
		t.Fatalf("expected concurrency 7")
	}
	if joined["CUSTOM"] != "1" {
		t.Fatalf("expected custom env to remain")
	}
}

func TestMergeEnvLastWinsByKey(t *testing.T) {
	got := mergeEnv([]string{"A=1", "B=1"}, []string{"B=2", "C=3"})
	m := map[string]string{}
	for _, kv := range got {
		for i := 0; i < len(kv); i++ {
			if kv[i] == '=' {
				m[kv[:i]] = kv[i+1:]
				break
			}
		}
	}
	if m["A"] != "1" || m["B"] != "2" || m["C"] != "3" {
		t.Fatalf("unexpected merge result: %#v", m)
	}
}
