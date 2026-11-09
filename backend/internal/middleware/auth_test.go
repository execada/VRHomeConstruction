package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/gin-gonic/gin"
)

const testSecret = "0123456789abcdefghijklmnopqrstuvwxyz"

// fakeSessions — текущие версии сессий пользователей; err — сбой хранилища.
type fakeSessions struct {
	versions map[string]int64
	err      error
}

func (f fakeSessions) SessionActive(_ context.Context, userID string, version int64) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	current, ok := f.versions[userID]
	return ok && current == version, nil
}

func authRouter(tokens *auth.TokenService, sessions SessionChecker) *gin.Engine {
	r := newTestRouter()
	r.GET("/me", Auth(tokens, sessions), func(c *gin.Context) { c.String(http.StatusOK, GetUserID(c)) })
	return r
}

func get(r http.Handler, header string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	if header != "" {
		req.Header.Set("Authorization", header)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestAuthMiddleware(t *testing.T) {
	tokens := auth.NewTokenService(testSecret, time.Hour)
	valid, _ := tokens.Generate("u1", 0)
	expired, _ := auth.NewTokenService(testSecret, -time.Minute).Generate("u1", 0)
	forged, _ := auth.NewTokenService("another-secret-another-secret-0123", time.Hour).Generate("u1", 0)
	r := authRouter(tokens, fakeSessions{versions: map[string]int64{"u1": 0}})

	cases := map[string]struct {
		header string
		status int
		body   string
	}{
		"missing":        {"", http.StatusUnauthorized, "authorization required"},
		"wrong scheme":   {"Basic dXNlcjpwYXNz", http.StatusUnauthorized, "invalid authorization header"},
		"no token":       {"Bearer", http.StatusUnauthorized, "invalid authorization header"},
		"foreign key":    {"Bearer " + forged, http.StatusUnauthorized, "invalid or expired token"},
		"expired":        {"Bearer " + expired, http.StatusUnauthorized, "invalid or expired token"},
		"valid any case": {"bearer " + valid, http.StatusOK, "u1"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			w := get(r, tc.header)
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.body) {
				t.Fatalf("expected %d %q, got %d %s", tc.status, tc.body, w.Code, w.Body.String())
			}
		})
	}
}

// После сброса пароля версия сессий растёт: токены со старой версией и токены
// удалённого пользователя больше не принимаются, токен с новой версией — принимается.
func TestAuthMiddlewareRejectsRevokedSessions(t *testing.T) {
	tokens := auth.NewTokenService(testSecret, time.Hour)
	old, _ := tokens.Generate("u1", 0)
	fresh, _ := tokens.Generate("u1", 1)
	ghost, _ := tokens.Generate("ghost", 0)
	r := authRouter(tokens, fakeSessions{versions: map[string]int64{"u1": 1}})

	for name, token := range map[string]string{"old version": old, "deleted user": ghost} {
		if w := get(r, "Bearer "+token); w.Code != http.StatusUnauthorized || !strings.Contains(w.Body.String(), "invalid or expired token") {
			t.Fatalf("%s: expected 401, got %d %s", name, w.Code, w.Body.String())
		}
	}
	if w := get(r, "Bearer "+fresh); w.Code != http.StatusOK || w.Body.String() != "u1" {
		t.Fatalf("a token with the current version must pass, got %d %s", w.Code, w.Body.String())
	}
}

// Сбой проверки сессии не пропускает запрос и не раскрывает деталей.
func TestAuthMiddlewareSessionCheckFailure(t *testing.T) {
	tokens := auth.NewTokenService(testSecret, time.Hour)
	valid, _ := tokens.Generate("u1", 0)
	r := authRouter(tokens, fakeSessions{err: errors.New("mongo: connection refused")})

	w := get(r, "Bearer "+valid)
	if w.Code != http.StatusInternalServerError || strings.Contains(w.Body.String(), "mongo") {
		t.Fatalf("expected an opaque 500, got %d %s", w.Code, w.Body.String())
	}
}

func TestGetUserIDWithoutAuth(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	if id := GetUserID(c); id != "" {
		t.Fatalf("expected empty user id, got %q", id)
	}
}
