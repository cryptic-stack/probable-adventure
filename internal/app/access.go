package app

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"

	tpl "github.com/cryptic-stack/probable-adventure/internal/templates"
)

type hostBinding struct {
	HostIP   string `json:"HostIp"`
	HostPort string `json:"HostPort"`
}

type portsMap map[string]map[string][]hostBinding

type rangeMetadata struct {
	Ports portsMap `json:"ports"`
}

type accessLink struct {
	ServiceName string `json:"service_name"`
	URL         string `json:"url"`
}

func parseRangeMetadata(raw json.RawMessage) rangeMetadata {
	var pm rangeMetadata
	_ = json.Unmarshal(raw, &pm)
	if pm.Ports == nil {
		pm.Ports = portsMap{}
	}
	return pm
}

func preferredHostPort(svc map[string][]hostBinding) string {
	if len(svc) == 0 {
		return ""
	}
	preferred := []string{"8080/tcp", "80/tcp", "443/tcp"}
	for _, key := range preferred {
		if binds := svc[key]; len(binds) > 0 && strings.TrimSpace(binds[0].HostPort) != "" {
			return binds[0].HostPort
		}
	}
	keys := make([]string, 0, len(svc))
	for key := range svc {
		if strings.HasSuffix(strings.ToLower(key), "/tcp") {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		if binds := svc[key]; len(binds) > 0 && strings.TrimSpace(binds[0].HostPort) != "" {
			return binds[0].HostPort
		}
	}
	return ""
}

func viewerNameHint(raw string) string {
	x := strings.TrimSpace(raw)
	if x == "" {
		return "guest"
	}
	x = strings.ReplaceAll(x, " ", "-")
	x = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '-' || r == '_' || r == '.':
			return r
		default:
			return -1
		}
	}, x)
	if x == "" {
		return "guest"
	}
	return x
}

func defaultNekoPassword(templateDef json.RawMessage) string {
	var def tpl.Definition
	if err := json.Unmarshal(templateDef, &def); err != nil {
		return ""
	}
	return strings.TrimSpace(def.Room.UserPass)
}

func buildRangeAccessLinks(rangeID int64, rangeMeta json.RawMessage, templateDef json.RawMessage, viewerHint string) []accessLink {
	pm := parseRangeMetadata(rangeMeta)
	if len(pm.Ports) == 0 {
		return nil
	}
	pwd := defaultNekoPassword(templateDef)
	usr := viewerNameHint(viewerHint)

	services := make([]string, 0, len(pm.Ports))
	for svc := range pm.Ports {
		services = append(services, svc)
	}
	sort.Strings(services)

	links := make([]accessLink, 0, len(services))
	for _, svc := range services {
		if preferredHostPort(pm.Ports[svc]) == "" {
			continue
		}
		path := fmt.Sprintf("/api/ranges/%d/access/%s/", rangeID, url.PathEscape(svc))
		q := url.Values{}
		q.Set("usr", usr)
		if pwd != "" {
			q.Set("pwd", pwd)
		}
		links = append(links, accessLink{
			ServiceName: svc,
			URL:         path + "?" + q.Encode(),
		})
	}
	return links
}

