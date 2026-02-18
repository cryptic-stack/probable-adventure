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
	Command      []string `json:"command"`
	ExposedPorts []Port   `json:"ports"`
	Healthcheck  string   `json:"healthcheck"`
}

type Port struct {
	Container int `json:"container"`
	Host      int `json:"host"`
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
		for _, p := range s.ExposedPorts {
			if p.Container <= 0 || p.Container > 65535 || p.Host < 0 || p.Host > 65535 {
				return errors.New("invalid port mapping")
			}
		}
	}
	return nil
}
