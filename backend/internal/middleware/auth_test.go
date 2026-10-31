package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/gin-gonic/gin"
)

func TestAuthMiddleware(t *testing.T) {
	const secret = "0123456789abcdefghijklmnopqrstuvwxyz"
	tokens := auth.NewTokenService(secret, time.Hour)
	valid, _ := tokens.Generate("u1")
	expired, _ := auth.NewTokenService(secret, -time.Minute).Generate("u1")
	forged, _ := auth.NewTokenService("another-secret-another-secret-0123", time.Hour).Generate("u1")

	r := newTestRouter()
	r.GET("/me", Auth(tokens), func(c *gin.Context) { c.String(http.StatusOK, GetUserID(c)) })

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
			req := httptest.NewRequest(http.MethodGet, "/me", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.body) {
				t.Fatalf("expected %d %q, got %d %s", tc.status, tc.body, w.Code, w.Body.String())
			}
		})
	}
}

func TestGetUserIDWithoutAuth(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	if id := GetUserID(c); id != "" {
		t.Fatalf("expected empty user id, got %q", id)
	}
}
