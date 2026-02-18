package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/cryptic-stack/probable-adventure/internal/auth"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/go-chi/chi/v5"
)

func (s *Server) listRooms(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	rangeID, err := parseRangeIDParam(r)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid id"})
		return
	}
	if _, err := s.q.GetRangeByIDForUser(r.Context(), rangeID, u.ID); err != nil {
		auth.JSON(w, 404, map[string]string{"error": "range not found"})
		return
	}
	rooms, err := s.q.ListRoomInstancesByRange(r.Context(), rangeID)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "db error"})
		return
	}
	auth.JSON(w, 200, rooms)
}

func (s *Server) startRoom(w http.ResponseWriter, r *http.Request)  { s.roomContainerAction(w, r, "start") }
func (s *Server) stopRoom(w http.ResponseWriter, r *http.Request)   { s.roomContainerAction(w, r, "stop") }
func (s *Server) restartRoom(w http.ResponseWriter, r *http.Request) { s.roomContainerAction(w, r, "restart") }

func (s *Server) recreateRoom(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	rangeID, err := parseRangeIDParam(r)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid id"})
		return
	}
	service := strings.TrimSpace(chi.URLParam(r, "service"))
	if service == "" {
		auth.JSON(w, 400, map[string]string{"error": "invalid service"})
		return
	}
	rg, err := s.q.GetRangeByIDForUser(r.Context(), rangeID, u.ID)
	if err != nil {
		auth.JSON(w, 404, map[string]string{"error": "range not found"})
		return
	}
	cid, err := s.findRangeServiceContainerID(r.Context(), rg.ID, service)
	if err != nil {
		auth.JSON(w, 404, map[string]string{"error": err.Error()})
		return
	}
	cli, err := s.newDockerClient()
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "docker client unavailable"})
		return
	}
	defer cli.Close()
	_ = cli.ContainerRemove(r.Context(), cid, container.RemoveOptions{Force: true, RemoveVolumes: true})

	job, err := s.q.CreateJob(r.Context(), rg.ID, rg.TeamID, "reset", "queued", []byte(`{"source":"room.recreate"}`), u.ID)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "enqueue failed"})
		return
	}
	_, _ = s.q.InsertEvent(r.Context(), rg.ID, &job.ID, "info", "room.recreate", "room recreate requested", []byte(`{}`))
	auth.JSON(w, 202, map[string]any{"status": "queued", "job_id": job.ID})
}

func (s *Server) roomContainerAction(w http.ResponseWriter, r *http.Request, action string) {
	u, _ := auth.CurrentUser(r)
	rangeID, err := parseRangeIDParam(r)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid id"})
		return
	}
	service := strings.TrimSpace(chi.URLParam(r, "service"))
	if service == "" {
		auth.JSON(w, 400, map[string]string{"error": "invalid service"})
		return
	}
	rg, err := s.q.GetRangeByIDForUser(r.Context(), rangeID, u.ID)
	if err != nil {
		auth.JSON(w, 404, map[string]string{"error": "range not found"})
		return
	}
	cid, err := s.findRangeServiceContainerID(r.Context(), rg.ID, service)
	if err != nil {
		auth.JSON(w, 404, map[string]string{"error": err.Error()})
		return
	}
	cli, err := s.newDockerClient()
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "docker client unavailable"})
		return
	}
	defer cli.Close()

	switch action {
	case "start":
		err = cli.ContainerStart(r.Context(), cid, container.StartOptions{})
	case "stop":
		timeout := 15
		err = cli.ContainerStop(r.Context(), cid, container.StopOptions{Timeout: &timeout})
	case "restart":
		timeout := 15
		err = cli.ContainerRestart(r.Context(), cid, container.StopOptions{Timeout: &timeout})
	default:
		err = errors.New("unsupported action")
	}
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "already") {
		auth.JSON(w, 500, map[string]string{"error": "container action failed: " + err.Error()})
		return
	}

	status := "running"
	if action == "stop" {
		status = "stopped"
	}
	room, roomErr := s.q.GetRoomInstanceByRangeService(r.Context(), rg.ID, service)
	settings := []byte(`{}`)
	if roomErr == nil {
		settings = room.Settings
	}
	_, _ = s.q.UpsertRoomInstance(r.Context(), rg.ID, rg.TeamID, service, status, fmt.Sprintf("/api/ranges/%d/access/%s/", rg.ID, service), settings, nil)
	_, _ = s.q.InsertEvent(r.Context(), rg.ID, nil, "info", "room."+action, "room "+action+" requested", []byte(`{}`))
	auth.JSON(w, 200, map[string]string{"status": status})
}

func (s *Server) newDockerClient() (*client.Client, error) {
	opts := []client.Opt{client.FromEnv, client.WithAPIVersionNegotiation()}
	if strings.TrimSpace(s.cfg.DockerHost) != "" {
		opts = append(opts, client.WithHost(strings.TrimSpace(s.cfg.DockerHost)))
	}
	return client.NewClientWithOpts(opts...)
}

func (s *Server) findRangeServiceContainerID(ctx context.Context, rangeID int64, service string) (string, error) {
	res, err := s.q.ListRangeResources(ctx, rangeID)
	if err != nil {
		return "", err
	}
	for _, r := range res {
		if r.ResourceType == "container" && r.ServiceName == service && strings.TrimSpace(r.DockerID) != "" {
			return r.DockerID, nil
		}
	}
	return "", fmt.Errorf("room service not found")
}

func parseRangeIDParam(r *http.Request) (int64, error) {
	raw := strings.TrimSpace(chi.URLParam(r, "id"))
	if raw == "" {
		return 0, fmt.Errorf("missing id")
	}
	return strconv.ParseInt(raw, 10, 64)
}
