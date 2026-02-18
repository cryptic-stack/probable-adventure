package templates

import (
	"encoding/json"
	"errors"
	"fmt"
)

type Definition struct {
	Name     string    `json:"name"`
	Services []Service `json:"services"`
}

type Service struct {
	Name         string   `json:"name"`
	Image        string   `json:"image"`
	Network      string   `json:"network"`
	Command      []string `json:"command"`
	Env          []string `json:"env"`
	ExposedPorts []Port   `json:"ports"`
	Healthcheck  string   `json:"healthcheck"`
}

type Port struct {
	Container int    `json:"container"`
	Host      int    `json:"host"`
	Protocol  string `json:"protocol"`
}

var allowedNetworks = map[string]struct{}{
	"redteam":   {},
	"blueteam":  {},
	"netbird":   {},
	"corporate": {},
	"guest":     {},
}

func NormalizeNetwork(n string) string {
	if n == "" {
		return "corporate"
	}
	return n
}

func ValidateDefinition(raw json.RawMessage) error {
	var d Definition
	if err := json.Unmarshal(raw, &d); err != nil {
		return fmt.Errorf("invalid json: %w", err)
	}
	if d.Name == "" {
		return errors.New("name required")
	}
	if len(d.Services) == 0 {
		return errors.New("at least one service required")
	}
	for _, s := range d.Services {
		if s.Name == "" || s.Image == "" {
			return errors.New("service name and image are required")
		}
		if _, ok := allowedNetworks[NormalizeNetwork(s.Network)]; !ok {
			return errors.New("invalid network (allowed: redteam, blueteam, netbird, corporate, guest)")
		}
		for _, p := range s.ExposedPorts {
			proto := p.Protocol
			if proto == "" {
				proto = "tcp"
			}
			if proto != "tcp" && proto != "udp" {
				return errors.New("invalid port protocol (allowed: tcp, udp)")
			}
			if p.Container <= 0 || p.Container > 65535 || p.Host < 0 || p.Host > 65535 {
				return errors.New("invalid port mapping")
			}
		}
	}
	return nil
}
