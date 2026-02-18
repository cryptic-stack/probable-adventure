package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/cryptic-stack/probable-adventure/internal/config"
	"github.com/cryptic-stack/probable-adventure/internal/db/sqlc"
	"github.com/jackc/pgx/v5"
)

type ctxKey string

const UserContextKey ctxKey = "user"

func CurrentUser(r *http.Request) (sqlc.User, bool) {
	u, ok := r.Context().Value(UserContextKey).(sqlc.User)
	return u, ok
}

func RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := CurrentUser(r); !ok {
			JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func UserMiddleware(cfg config.Config, mgr *Manager, q *sqlc.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			email := strings.ToLower(strings.TrimSpace(cfg.DevAuthEmail))
			if email == "" {
				if se, ok := mgr.GetSessionEmail(r); ok {
					email = se
				}
			}
			if email == "" {
				next.ServeHTTP(w, r)
				return
			}
			u, err := q.GetUserByEmail(r.Context(), email)
			if err != nil {
				if !errors.Is(err, pgx.ErrNoRows) {
					JSON(w, 500, map[string]string{"error": "db error"})
					return
				}
				role := "student"
				if _, ok := cfg.AdminEmails[email]; ok {
					role = "admin"
				}
				name := strings.Split(email, "@")[0]
				u, err = q.CreateUser(r.Context(), email, name, role)
				if err != nil {
					JSON(w, 500, map[string]string{"error": "create user failed"})
					return
				}
				if err := q.EnsureTeamExistsByName(r.Context(), "Default Team"); err != nil {
					JSON(w, 500, map[string]string{"error": "create default team failed"})
					return
				}
				teamRole := "student"
				if u.Role == "admin" {
					teamRole = "admin"
				}
				if err := q.AddUserToTeamByName(r.Context(), u.ID, teamRole, "Default Team"); err != nil {
					JSON(w, 500, map[string]string{"error": "add team membership failed"})
					return
				}
			}
			ctx := context.WithValue(r.Context(), UserContextKey, u)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
