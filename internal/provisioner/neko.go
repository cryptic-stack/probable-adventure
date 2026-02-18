package provisioner

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
	tmpl "github.com/cryptic-stack/probable-adventure/internal/templates"
)

func buildServiceEnv(room tmpl.RoomOptions, svc tmpl.Service) []string {
	base := []string{}
	if room.UserPass != "" || room.AdminPass != "" || room.MaxConnections > 0 || room.ControlProtection != nil || room.ImplicitControl != nil {
		base = append(base, "NEKO_MEMBER_PROVIDER=multiuser")
		base = append(base, "NEKO_WEBRTC_ICELITE=1")
		base = append(base, "NEKO_WEBRTC_EPR=52000-52000")
		if room.UserPass != "" {
			base = append(base, "NEKO_MEMBER_MULTIUSER_USER_PASSWORD="+room.UserPass)
		}
		if room.AdminPass != "" {
			base = append(base, "NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD="+room.AdminPass)
		}
		if room.MaxConnections > 0 {
			base = append(base, "NEKO_SERVER_CONCURRENCY="+strconv.Itoa(room.MaxConnections))
		}
		if room.ControlProtection != nil {
			base = append(base, fmt.Sprintf("NEKO_CONTROL_PROTECTION=%t", *room.ControlProtection))
		}
		if room.ImplicitControl != nil {
			base = append(base, fmt.Sprintf("NEKO_IMPLICIT_CONTROL=%t", *room.ImplicitControl))
		}
	}
	return mergeEnv(base, svc.Env)
}

func effectiveRoomOptions(def tmpl.Definition, room sqlc.RoomInstance) tmpl.RoomOptions {
	out := def.Room
	if len(room.Settings) == 0 {
		return out
	}
	var override tmpl.RoomOptions
	if err := json.Unmarshal(room.Settings, &override); err != nil {
		return out
	}
	if override.UserPass != "" {
		out.UserPass = override.UserPass
	}
	if override.AdminPass != "" {
		out.AdminPass = override.AdminPass
	}
	if override.MaxConnections > 0 {
		out.MaxConnections = override.MaxConnections
	}
	if override.ControlProtection != nil {
		out.ControlProtection = override.ControlProtection
	}
	if override.ImplicitControl != nil {
		out.ImplicitControl = override.ImplicitControl
	}
	return out
}

func roomOptionsJSON(room tmpl.RoomOptions) []byte {
	b, err := json.Marshal(room)
	if err != nil {
		return []byte(`{}`)
	}
	return b
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
