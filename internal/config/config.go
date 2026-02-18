package config

import (
	"os"
	"strings"
)

type Config struct {
	Env                string
	HTTPAddr           string
	DatabaseURL        string
	SessionKey         string
	DevAuthEmail       string
	AdminEmails        map[string]struct{}
	DockerHubRepos     []string
	DockerHubImageRefs []string
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string
	WorkerID           string
	DockerHost         string
}

func Load() Config {
	admins := map[string]struct{}{}
	for _, e := range strings.Split(os.Getenv("ADMIN_EMAILS"), ",") {
		e = strings.TrimSpace(strings.ToLower(e))
		if e != "" {
			admins[e] = struct{}{}
		}
	}
	repos := splitCSV(getenv("DOCKERHUB_REPOS", "crypticstack/probable-adventure-base-server,crypticstack/probable-adventure-base-user,crypticstack/probable-adventure-attack-box,crypticstack/probable-adventure-web-lab,crypticstack/probable-adventure-desktop-web"))
	imageRefs := splitCSV(getenv("DOCKERHUB_IMAGE_REFS", "crypticstack/probable-adventure-base-server:bookworm,crypticstack/probable-adventure-base-user:bookworm-xfce,crypticstack/probable-adventure-attack-box:bookworm,crypticstack/probable-adventure-web-lab:bookworm,crypticstack/probable-adventure-desktop-web:bookworm-novnc"))
	return Config{
		Env:                getenv("APP_ENV", "dev"),
		HTTPAddr:           getenv("HTTP_ADDR", ":8080"),
		DatabaseURL:        getenv("DATABASE_URL", "postgres://range:range@localhost:5432/rangedb?sslmode=disable"),
		SessionKey:         getenv("SESSION_KEY", "dev-session-key-change-me"),
		DevAuthEmail:       strings.TrimSpace(os.Getenv("DEV_AUTH_EMAIL")),
		AdminEmails:        admins,
		DockerHubRepos:     repos,
		DockerHubImageRefs: imageRefs,
		GoogleClientID:     strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
		GoogleClientSecret: strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET")),
		GoogleRedirectURL:  strings.TrimSpace(os.Getenv("GOOGLE_REDIRECT_URL")),
		WorkerID:           getenv("WORKER_ID", "provisioner-1"),
		DockerHost:         strings.TrimSpace(os.Getenv("DOCKER_HOST")),
	}
}

func getenv(k, d string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return d
}

func splitCSV(in string) []string {
	out := make([]string, 0)
	for _, part := range strings.Split(in, ",") {
		p := strings.TrimSpace(part)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
