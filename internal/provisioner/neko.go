package provisioner

import (
	"fmt"
	"strconv"
	"strings"

	tmpl "github.com/cryptic-stack/probable-adventure/internal/templates"
)

func buildServiceEnv(def tmpl.Definition, svc tmpl.Service) []string {
	base := []string{}
	if def.Room.UserPass != "" || def.Room.AdminPass != "" || def.Room.MaxConnections > 0 || def.Room.ControlProtection != nil || def.Room.ImplicitControl != nil {
		base = append(base, "NEKO_MEMBER_PROVIDER=multiuser")
		base = append(base, "NEKO_WEBRTC_ICELITE=1")
		base = append(base, "NEKO_WEBRTC_EPR=52000-52000")
		if def.Room.UserPass != "" {
			base = append(base, "NEKO_MEMBER_MULTIUSER_USER_PASSWORD="+def.Room.UserPass)
		}
		if def.Room.AdminPass != "" {
			base = append(base, "NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD="+def.Room.AdminPass)
		}
		if def.Room.MaxConnections > 0 {
			base = append(base, "NEKO_SERVER_CONCURRENCY="+strconv.Itoa(def.Room.MaxConnections))
		}
		if def.Room.ControlProtection != nil {
			base = append(base, fmt.Sprintf("NEKO_CONTROL_PROTECTION=%t", *def.Room.ControlProtection))
		}
		if def.Room.ImplicitControl != nil {
			base = append(base, fmt.Sprintf("NEKO_IMPLICIT_CONTROL=%t", *def.Room.ImplicitControl))
		}
	}
	return mergeEnv(base, svc.Env)
}

func mergeEnv(base, overrides []string) []string {
	out := make([]string, 0, len(base)+len(overrides))
	index := map[string]int{}
	appendOne := func(kv string) {
		key := kv
		if i := strings.IndexByte(kv, '='); i > 0 {
			key = kv[:i]
		}
		if pos, ok := index[key]; ok {
			out[pos] = kv
			return
		}
		index[key] = len(out)
		out = append(out, kv)
	}
	for _, kv := range base {
		appendOne(kv)
	}
	for _, kv := range overrides {
		appendOne(kv)
	}
	return out
}
