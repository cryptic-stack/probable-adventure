package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/cryptic-stack/probable-adventure/internal/config"
	"github.com/gorilla/sessions"
	"golang.org/x/oauth2"
)

const sessionName = "range_session"

type Manager struct {
	cfg      config.Config
	store    *sessions.CookieStore
	provider *oidc.Provider
	oauth2   *oauth2.Config
	verifier *oidc.IDTokenVerifier
}

func NewManager(ctx context.Context, cfg config.Config) (*Manager, error) {
	store := sessions.NewCookieStore([]byte(cfg.SessionKey))
	store.Options = &sessions.Options{
		Path:     "/",
		HttpOnly: true,
		Secure:   cfg.Env != "dev",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   60 * 60 * 24,
	}

	m := &Manager{cfg: cfg, store: store}
	if cfg.GoogleClientID == "" || cfg.GoogleClientSecret == "" || cfg.GoogleRedirectURL == "" {
		return m, nil
	}

	provider, err := oidc.NewProvider(ctx, "https://accounts.google.com")
	if err != nil {
		return nil, err
	}
	m.provider = provider
	m.oauth2 = &oauth2.Config{
		ClientID:     cfg.GoogleClientID,
		ClientSecret: cfg.GoogleClientSecret,
		RedirectURL:  cfg.GoogleRedirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}
	m.verifier = provider.Verifier(&oidc.Config{ClientID: cfg.GoogleClientID})
	return m, nil
}

func (m *Manager) OIDCEnabled() bool {
	return m.provider != nil
}

func (m *Manager) StartLogin(w http.ResponseWriter, r *http.Request) error {
	if m.oauth2 == nil {
		return errors.New("oidc not configured")
	}
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return err
	}
	state := hex.EncodeToString(b[:])
	s, _ := m.store.Get(r, sessionName)
	s.Values["state"] = state
	if err := s.Save(r, w); err != nil {
		return err
	}
	http.Redirect(w, r, m.oauth2.AuthCodeURL(state), http.StatusFound)
	return nil
}

type IDClaims struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

func (m *Manager) HandleCallback(w http.ResponseWriter, r *http.Request) (*IDClaims, error) {
	if m.oauth2 == nil || m.verifier == nil {
		return nil, errors.New("oidc not configured")
	}
	s, _ := m.store.Get(r, sessionName)
	if s.Values["state"] != r.URL.Query().Get("state") {
		return nil, errors.New("invalid oauth state")
	}
	tok, err := m.oauth2.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		return nil, err
	}
	rawIDToken, ok := tok.Extra("id_token").(string)
	if !ok {
		return nil, errors.New("missing id_token")
	}
	idt, err := m.verifier.Verify(r.Context(), rawIDToken)
	if err != nil {
		return nil, err
	}
	var claims IDClaims
	if err := idt.Claims(&claims); err != nil {
		return nil, err
	}
	if strings.TrimSpace(claims.Email) == "" {
		return nil, errors.New("email missing in id token")
	}
	return &claims, nil
}

func (m *Manager) SetSessionEmail(w http.ResponseWriter, r *http.Request, email string) error {
	s, _ := m.store.Get(r, sessionName)
	s.Values["email"] = strings.ToLower(strings.TrimSpace(email))
	return s.Save(r, w)
}

func (m *Manager) GetSessionEmail(r *http.Request) (string, bool) {
	s, _ := m.store.Get(r, sessionName)
	e, _ := s.Values["email"].(string)
	e = strings.ToLower(strings.TrimSpace(e))
	return e, e != ""
}

func (m *Manager) ClearSession(w http.ResponseWriter, r *http.Request) error {
	s, _ := m.store.Get(r, sessionName)
	s.Options.MaxAge = -1
	return s.Save(r, w)
}

func JSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
