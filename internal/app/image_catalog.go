package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/cryptic-stack/probable-adventure/internal/config"
)

type imageCatalogItem struct {
	Repository  string `json:"repository"`
	Tag         string `json:"tag"`
	Image       string `json:"image"`
	LastUpdated string `json:"last_updated,omitempty"`
}

type dockerHubTagsResponse struct {
	Results []struct {
		Name        string `json:"name"`
		LastUpdated string `json:"last_updated"`
	} `json:"results"`
}

func listDockerHubImages(ctx context.Context, cfg config.Config) ([]imageCatalogItem, error) {
	items := make([]imageCatalogItem, 0)
	seen := map[string]struct{}{}
	client := &http.Client{Timeout: 5 * time.Second}
	for _, repo := range cfg.DockerHubRepos {
		parts := strings.SplitN(repo, "/", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			continue
		}
		namespace := parts[0]
		repository := parts[1]
		url := fmt.Sprintf("https://hub.docker.com/v2/repositories/%s/%s/tags?page_size=25", namespace, repository)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode >= 300 {
			_ = resp.Body.Close()
			return nil, fmt.Errorf("docker hub returned status %d for %s", resp.StatusCode, repo)
		}
		var body dockerHubTagsResponse
		err = json.NewDecoder(resp.Body).Decode(&body)
		_ = resp.Body.Close()
		if err != nil {
			return nil, err
		}
		for _, t := range body.Results {
			item := imageCatalogItem{
				Repository:  repo,
				Tag:         t.Name,
				Image:       repo + ":" + t.Name,
				LastUpdated: t.LastUpdated,
			}
			if _, ok := seen[item.Image]; ok {
				continue
			}
			seen[item.Image] = struct{}{}
			items = append(items, item)
		}
	}
	for _, ref := range cfg.DockerHubImageRefs {
		repo, tag := splitImageRef(ref)
		if repo == "" || tag == "" {
			continue
		}
		if _, ok := seen[ref]; ok {
			continue
		}
		seen[ref] = struct{}{}
		items = append(items, imageCatalogItem{
			Repository: repo,
			Tag:        tag,
			Image:      ref,
		})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Repository == items[j].Repository {
			return items[i].Tag < items[j].Tag
		}
		return items[i].Repository < items[j].Repository
	})
	return items, nil
}

func splitImageRef(ref string) (string, string) {
	parts := strings.Split(ref, ":")
	if len(parts) < 2 {
		return "", ""
	}
	repo := strings.Join(parts[:len(parts)-1], ":")
	tag := parts[len(parts)-1]
	if strings.TrimSpace(repo) == "" || strings.TrimSpace(tag) == "" {
		return "", ""
	}
	return repo, tag
}
