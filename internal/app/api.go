package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/cryptic-stack/probable-adventure/internal/audit"
	"github.com/cryptic-stack/probable-adventure/internal/auth"
	"github.com/cryptic-stack/probable-adventure/internal/config"
	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
	"github.com/cryptic-stack/probable-adventure/internal/rbac"
	"github.com/cryptic-stack/probable-adventure/internal/sse"
	tpl "github.com/cryptic-stack/probable-adventure/internal/templates"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	cfg   config.Config
	pool  *pgxpool.Pool
	q     *sqlc.Queries
	authm *auth.Manager
	audit *audit.Logger
	poll  time.Duration
	web   string
}

func NewServer(ctx context.Context, cfg config.Config, pool *pgxpool.Pool) (*Server, error) {
	a, err := auth.NewManager(ctx, cfg)
	if err != nil {
		return nil, err
	}
	q := sqlc.New(pool)
	return &Server{cfg: cfg, pool: pool, q: q, authm: a, audit: audit.New(q), poll: time.Second, web: resolveWebDir()}, nil
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer)
	r.Use(auth.UserMiddleware(s.cfg, s.authm, s.q))

	r.Get("/healthz", s.handleHealth)
	r.Get("/auth/google/login", s.handleGoogleLogin)
	r.Get("/auth/google/callback", s.handleGoogleCallback)
	r.Post("/auth/logout", s.handleLogout)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, s.web+"/index.html")
	})
	r.Handle("/web/*", http.StripPrefix("/web/", http.FileServer(http.Dir(s.web))))

	r.Route("/api", func(api chi.Router) {
		api.With(auth.RequireUser).Get("/me", s.handleMe)

		api.Group(func(pr chi.Router) {
			pr.Use(auth.RequireUser)
			pr.Get("/catalog/images", s.listImageCatalog)
			pr.Get("/templates", s.listTemplates)
			pr.Get("/templates/{id}", s.getTemplate)
			pr.Get("/ranges", s.listRanges)
			pr.Get("/ranges/{id}", s.getRange)
			pr.Get("/ranges/{id}/rooms", s.listRooms)
			pr.Get("/ranges/{id}/rooms/{service}", s.getRoomSettings)
			pr.Get("/ranges/{id}/access/{service}", s.proxyRangeService)
			pr.Get("/ranges/{id}/access/{service}/*", s.proxyRangeService)
			pr.Get("/ranges/{id}/events", s.streamRangeEvents)
		})

		api.Group(func(sw chi.Router) {
			sw.Use(auth.RequireUser)
			sw.With(rbac.RequireRole("admin")).Post("/templates", s.createTemplate)
			sw.Post("/ranges", s.createRange)
			sw.Put("/ranges/{id}/rooms/{service}", s.updateRoomSettings)
			sw.Post("/ranges/{id}/rooms/{service}/start", s.startRoom)
			sw.Post("/ranges/{id}/rooms/{service}/stop", s.stopRoom)
			sw.Post("/ranges/{id}/rooms/{service}/restart", s.restartRoom)
			sw.Post("/ranges/{id}/rooms/{service}/recreate", s.recreateRoom)
			sw.Post("/ranges/{id}/destroy", s.destroyRange)
			sw.Post("/ranges/{id}/reset", s.resetRange)
		})
	})

	return r
}

func resolveWebDir() string {
	if _, err := os.Stat("web/index.html"); err == nil {
		return "web"
	}
	if _, err := os.Stat("/web/index.html"); err == nil {
		return "/web"
	}
	return "web"
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	status := "ok"
	dbStatus := "ok"
	if err := s.q.Ping(ctx); err != nil {
		dbStatus = "error"
		status = "degraded"
	}
	auth.JSON(w, http.StatusOK, map[string]string{"status": status, "db": dbStatus})
}

func (s *Server) handleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	if err := s.authm.StartLogin(w, r); err != nil {
		auth.JSON(w, 400, map[string]string{"error": err.Error()})
	}
}

func (s *Server) handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	claims, err := s.authm.HandleCallback(w, r)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if err := s.authm.SetSessionEmail(w, r, claims.Email); err != nil {
		auth.JSON(w, 500, map[string]string{"error": "session save failed"})
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	_ = s.authm.ClearSession(w, r)
	auth.JSON(w, 200, map[string]string{"status": "logged_out"})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	auth.JSON(w, 200, u)
}

type createTemplateReq struct {
	Name        string          `json:"name"`
	DisplayName string          `json:"display_name"`
	Description string          `json:"description"`
	Definition  json.RawMessage `json:"definition_json"`
	Quota       int32           `json:"quota"`
}

func (s *Server) createTemplate(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	var req createTemplateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid json"})
		return
	}
	if req.Name == "" || req.DisplayName == "" {
		auth.JSON(w, 400, map[string]string{"error": "name and display_name required"})
		return
	}
	if req.Quota <= 0 {
		req.Quota = 1
	}
	if err := tpl.ValidateDefinition(req.Definition); err != nil {
		auth.JSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	v, err := s.q.GetLatestTemplateVersionByName(r.Context(), req.Name)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "db error"})
		return
	}
	t, err := s.q.CreateTemplate(r.Context(), req.Name, v+1, req.DisplayName, req.Description, req.Definition, req.Quota, u.ID)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "create failed"})
		return
	}
	s.audit.Log(r.Context(), u.ID, nil, nil, "template.create", map[string]any{"template_id": t.ID})
	auth.JSON(w, 201, t)
}

func (s *Server) listTemplates(w http.ResponseWriter, r *http.Request) {
	t, err := s.q.ListTemplates(r.Context())
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "db error"})
		return
	}
	auth.JSON(w, 200, t)
}

func (s *Server) listImageCatalog(w http.ResponseWriter, r *http.Request) {
	images, err := listDockerHubImages(r.Context(), s.cfg)
	if err != nil {
		auth.JSON(w, 502, map[string]string{"error": "docker hub catalog unavailable"})
		return
	}
	auth.JSON(w, 200, images)
}

func (s *Server) getTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid id"})
		return
	}
	t, err := s.q.GetTemplateByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			auth.JSON(w, 404, map[string]string{"error": "not found"})
			return
		}
		auth.JSON(w, 500, map[string]string{"error": "db error"})
		return
	}
	auth.JSON(w, 200, t)
}

type createRangeReq struct {
	TeamID     int64  `json:"team_id"`
	TemplateID int64  `json:"template_id"`
	Name       string `json:"name"`
	Room       *struct {
		UserPass          string `json:"user_pass"`
		AdminPass         string `json:"admin_pass"`
		MaxConnections    int    `json:"max_connections"`
		ControlProtection *bool  `json:"control_protection"`
	} `json:"room"`
	Rooms []struct {
		Name    string `json:"name"`
		Image   string `json:"image"`
		Network string `json:"network"`
	} `json:"rooms"`
}

func (s *Server) userInTeam(ctx context.Context, userID, teamID int64) (bool, error) {
	return s.q.TeamMembershipExists(ctx, userID, teamID)
}

func (s *Server) createRange(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	var req createRangeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid json"})
		return
	}
	ok, err := s.userInTeam(r.Context(), u.ID, req.TeamID)
	if err != nil || !ok {
		auth.JSON(w, 403, map[string]string{"error": "not in team"})
		return
	}

	templateID, t, err := s.resolveTemplateForRange(r.Context(), req, u.ID)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	count, err := s.q.CountActiveRangesForTeamTemplate(r.Context(), req.TeamID, templateID)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "db error"})
		return
	}
	if count >= int64(t.Quota) {
		auth.JSON(w, 409, map[string]string{"error": "template quota exceeded"})
		return
	}
	if req.Name == "" {
		req.Name = fmt.Sprintf("range-%d", time.Now().Unix())
	}
	rng, err := s.q.CreateRange(r.Context(), req.TeamID, templateID, u.ID, req.Name, "pending", []byte(`{"ports":{}}`))
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "create range failed"})
		return
	}
	job, err := s.q.CreateJob(r.Context(), rng.ID, req.TeamID, "provision", "queued", []byte(`{}`), u.ID)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "enqueue failed"})
		return
	}
	_, _ = s.q.InsertEvent(r.Context(), rng.ID, &job.ID, "info", "job.queued", "provision job queued", []byte(`{}`))
	team := rng.TeamID
	rid := rng.ID
	s.audit.Log(r.Context(), u.ID, &team, &rid, "range.create", map[string]any{"job_id": job.ID})
	auth.JSON(w, 201, map[string]any{"range": rng, "job": job})
}

func (s *Server) resolveTemplateForRange(ctx context.Context, req createRangeReq, userID int64) (int64, sqlc.Template, error) {
	if req.TemplateID > 0 {
		t, err := s.q.GetTemplateByID(ctx, req.TemplateID)
		if err != nil {
			return 0, sqlc.Template{}, fmt.Errorf("template not found")
		}
		return t.ID, t, nil
	}
	if len(req.Rooms) == 0 {
		return 0, sqlc.Template{}, fmt.Errorf("template_id or rooms is required")
	}

	services := make([]tpl.Service, 0, len(req.Rooms))
	for i, room := range req.Rooms {
		name := strings.TrimSpace(room.Name)
		image := strings.TrimSpace(room.Image)
		if name == "" {
			name = fmt.Sprintf("room-%d", i+1)
		}
		if image == "" {
			return 0, sqlc.Template{}, fmt.Errorf("room image is required")
		}
		network := strings.TrimSpace(room.Network)
		if network == "" {
			network = "guest"
		}
		services = append(services, tpl.Service{
			Name:    name,
			Image:   image,
			Network: network,
			ExposedPorts: []tpl.Port{
				{Container: 8080, Host: 0, Protocol: "tcp"},
				{Container: 52000, Host: 0, Protocol: "udp"},
			},
		})
	}

	room := tpl.RoomOptions{
		UserPass:       "neko",
		AdminPass:      "admin",
		MaxConnections: 8,
	}
	if req.Room != nil {
		if strings.TrimSpace(req.Room.UserPass) != "" {
			room.UserPass = strings.TrimSpace(req.Room.UserPass)
		}
		if strings.TrimSpace(req.Room.AdminPass) != "" {
			room.AdminPass = strings.TrimSpace(req.Room.AdminPass)
		}
		if req.Room.MaxConnections > 0 {
			room.MaxConnections = req.Room.MaxConnections
		}
		room.ControlProtection = req.Room.ControlProtection
	}

	def := tpl.Definition{
		Name:     fmt.Sprintf("range-%d", time.Now().UnixNano()),
		Room:     room,
		Services: services,
	}
	raw, err := json.Marshal(def)
	if err != nil {
		return 0, sqlc.Template{}, fmt.Errorf("invalid room definition")
	}
	if err := tpl.ValidateDefinition(raw); err != nil {
		return 0, sqlc.Template{}, fmt.Errorf("invalid room definition: %v", err)
	}

	tplName := fmt.Sprintf("adhoc-team-%d", req.TeamID)
	latest, err := s.q.GetLatestTemplateVersionByName(ctx, tplName)
	if err != nil {
		return 0, sqlc.Template{}, fmt.Errorf("db error")
	}
	t, err := s.q.CreateTemplate(
		ctx,
		tplName,
		latest+1,
		fmt.Sprintf("Adhoc Team %d Range", req.TeamID),
		"auto-generated from range rooms",
		raw,
		1,
		userID,
	)
	if err != nil {
		return 0, sqlc.Template{}, fmt.Errorf("create template failed")
	}
	return t.ID, t, nil
}

func (s *Server) listRanges(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	ranges, err := s.q.ListRangesForUser(r.Context(), u.ID)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "db error"})
		return
	}
	auth.JSON(w, 200, ranges)
}

func (s *Server) getRange(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid id"})
		return
	}
	rg, err := s.q.GetRangeByIDForUser(r.Context(), id, u.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			auth.JSON(w, 404, map[string]string{"error": "not found"})
			return
		}
		auth.JSON(w, 500, map[string]string{"error": "db error"})
		return
	}
	resources := []map[string]any{}
	rr, err := s.q.ListRangeResources(r.Context(), id)
	if err == nil {
		for _, rsrc := range rr {
			resources = append(resources, map[string]any{
				"resource_type": rsrc.ResourceType,
				"docker_id":     rsrc.DockerID,
				"service_name":  rsrc.ServiceName,
				"metadata":      rsrc.Metadata,
			})
		}
	}
	templateDef := json.RawMessage(`{}`)
	if t, err := s.q.GetTemplateByID(r.Context(), rg.TemplateID); err == nil {
		templateDef = t.Definition
	}
	viewerHint := strings.TrimSpace(u.Name)
	if viewerHint == "" {
		viewerHint = strings.SplitN(strings.TrimSpace(u.Email), "@", 2)[0]
	}
	rooms, _ := s.q.ListRoomInstancesByRange(r.Context(), rg.ID)
	access := buildRangeAccessLinks(rg.ID, rg.Metadata, templateDef, rooms, viewerHint)
	auth.JSON(w, 200, map[string]any{"range": rg, "resources": resources, "rooms": rooms, "access": access})
}

func (s *Server) enqueueAction(w http.ResponseWriter, r *http.Request, action string) {
	u, _ := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid id"})
		return
	}
	rg, err := s.q.GetRangeByIDForUser(r.Context(), id, u.ID)
	if err != nil {
		auth.JSON(w, 404, map[string]string{"error": "range not found"})
		return
	}
	job, err := s.q.CreateJob(r.Context(), rg.ID, rg.TeamID, action, "queued", []byte(`{}`), u.ID)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "enqueue failed"})
		return
	}
	_, _ = s.q.InsertEvent(r.Context(), rg.ID, &job.ID, "info", "job.queued", action+" job queued", []byte(`{}`))
	team := rg.TeamID
	rid := rg.ID
	s.audit.Log(r.Context(), u.ID, &team, &rid, "range."+action, map[string]any{"job_id": job.ID})
	auth.JSON(w, 202, job)
}

func (s *Server) destroyRange(w http.ResponseWriter, r *http.Request) {
	s.enqueueAction(w, r, "destroy")
}
func (s *Server) resetRange(w http.ResponseWriter, r *http.Request) { s.enqueueAction(w, r, "reset") }

func (s *Server) getRoomSettings(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid id"})
		return
	}
	service := strings.TrimSpace(chi.URLParam(r, "service"))
	if service == "" {
		auth.JSON(w, 400, map[string]string{"error": "invalid service"})
		return
	}
	rg, err := s.q.GetRangeByIDForUser(r.Context(), id, u.ID)
	if err != nil {
		auth.JSON(w, 404, map[string]string{"error": "range not found"})
		return
	}
	room, err := s.q.GetRoomInstanceByRangeService(r.Context(), rg.ID, service)
	if err == nil {
		auth.JSON(w, 200, room)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		auth.JSON(w, 500, map[string]string{"error": "db error"})
		return
	}
	tplRec, err := s.q.GetTemplateByID(r.Context(), rg.TemplateID)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "template lookup failed"})
		return
	}
	var def tpl.Definition
	if err := json.Unmarshal(tplRec.Definition, &def); err != nil {
		auth.JSON(w, 500, map[string]string{"error": "template parse failed"})
		return
	}
	settings, _ := json.Marshal(def.Room)
	auth.JSON(w, 200, map[string]any{
		"range_id":     rg.ID,
		"team_id":      rg.TeamID,
		"service_name": service,
		"status":       "pending",
		"entry_path":   fmt.Sprintf("/api/ranges/%d/access/%s/", rg.ID, url.PathEscape(service)),
		"settings_json": json.RawMessage(settings),
	})
}

type updateRoomSettingsReq struct {
	Room      tpl.RoomOptions `json:"room"`
	Reconcile *bool           `json:"reconcile"`
}

func (s *Server) updateRoomSettings(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid id"})
		return
	}
	service := strings.TrimSpace(chi.URLParam(r, "service"))
	if service == "" {
		auth.JSON(w, 400, map[string]string{"error": "invalid service"})
		return
	}
	rg, err := s.q.GetRangeByIDForUser(r.Context(), id, u.ID)
	if err != nil {
		auth.JSON(w, 404, map[string]string{"error": "range not found"})
		return
	}
	var req updateRoomSettingsReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid json"})
		return
	}
	if err := tpl.ValidateRoomOptions(req.Room); err != nil {
		auth.JSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	shouldReconcile := true
	if req.Reconcile != nil {
		shouldReconcile = *req.Reconcile
	}
	settings, _ := json.Marshal(req.Room)
	room, err := s.q.UpsertRoomInstance(
		r.Context(),
		rg.ID,
		rg.TeamID,
		service,
		"running",
		fmt.Sprintf("/api/ranges/%d/access/%s/", rg.ID, url.PathEscape(service)),
		settings,
		nil,
	)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "room settings update failed"})
		return
	}
	if shouldReconcile {
		job, err := s.q.CreateJob(r.Context(), rg.ID, rg.TeamID, "reset", "queued", []byte(`{"source":"room.settings.update"}`), u.ID)
		if err == nil {
			_, _ = s.q.InsertEvent(r.Context(), rg.ID, &job.ID, "info", "room.settings.update", "room settings updated, reset queued", []byte(`{}`))
		}
	}
	team := rg.TeamID
	rid := rg.ID
	s.audit.Log(r.Context(), u.ID, &team, &rid, "room.settings.update", map[string]any{"service_name": service})
	auth.JSON(w, 200, room)
}

func (s *Server) streamRangeEvents(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid id"})
		return
	}
	if _, err := s.q.GetRangeByIDForUser(r.Context(), id, u.ID); err != nil {
		auth.JSON(w, 404, map[string]string{"error": "range not found"})
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		auth.JSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming unsupported"})
		return
	}
	_ = sse.StreamRangeEvents(r.Context(), struct {
		http.ResponseWriter
		http.Flusher
	}{ResponseWriter: w, Flusher: flusher}, s.q, id, s.poll)
}

func (s *Server) proxyRangeService(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		auth.JSON(w, 400, map[string]string{"error": "invalid id"})
		return
	}
	service := strings.TrimSpace(chi.URLParam(r, "service"))
	if service == "" {
		auth.JSON(w, 400, map[string]string{"error": "invalid service"})
		return
	}
	rg, err := s.q.GetRangeByIDForUser(r.Context(), id, u.ID)
	if err != nil {
		auth.JSON(w, 404, map[string]string{"error": "range not found"})
		return
	}
	pm := parseRangeMetadata(rg.Metadata)
	svc := pm.Ports[service]
	if len(svc) == 0 {
		auth.JSON(w, 404, map[string]string{"error": "service has no published ports"})
		return
	}
	hostPort := preferredHostPort(svc)
	if hostPort == "" {
		auth.JSON(w, 404, map[string]string{"error": "service has no host port"})
		return
	}
	targetHost := firstReachableHost(hostPort)
	targetURL, err := url.Parse("http://" + targetHost + ":" + hostPort)
	if err != nil {
		auth.JSON(w, 500, map[string]string{"error": "proxy target parse failed"})
		return
	}
	p := httputil.NewSingleHostReverseProxy(targetURL)
	orig := p.Director
	p.Director = func(req *http.Request) {
		orig(req)
		tail := chi.URLParam(r, "*")
		if strings.TrimSpace(tail) == "" {
			req.URL.Path = "/"
		} else {
			if !strings.HasPrefix(tail, "/") {
				tail = "/" + tail
			}
			req.URL.Path = tail
		}
		req.URL.RawQuery = r.URL.RawQuery
	}
	p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		auth.JSON(w, 502, map[string]string{"error": "upstream service unavailable"})
	}
	p.ServeHTTP(w, r)
}

func firstReachableHost(port string) string {
	candidates := []string{"host.docker.internal", "127.0.0.1", "localhost"}
	for _, h := range candidates {
		conn, err := net.DialTimeout("tcp", net.JoinHostPort(h, port), 300*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return h
		}
	}
	return "localhost"
}

func StartHTTP(ctx context.Context, cfg config.Config, pool *pgxpool.Pool) error {
	s, err := NewServer(ctx, cfg, pool)
	if err != nil {
		return err
	}
	h := s.Router()
	server := &http.Server{Addr: cfg.HTTPAddr, Handler: h}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	fmt.Fprintf(os.Stdout, "api listening on %s\n", cfg.HTTPAddr)
	return server.ListenAndServe()
}
