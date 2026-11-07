package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/execada/VRHomeConstruction/backend/internal/config"
	"github.com/execada/VRHomeConstruction/backend/internal/handlers"
	"github.com/gin-gonic/gin"
)

var testTokens = auth.NewTokenService(strings.Repeat("k", 32)+"0123456789", time.Hour)

// revokedSessions — проверка сессий, для которой действует только версия 1 (пароль уже сбрасывали).
type revokedSessions struct{}

func (revokedSessions) SessionActive(_ context.Context, _ string, version int64) (bool, error) {
	return version == 1, nil
}

// testRouter собирает API без базы: обработчики без сервисов годятся, потому что
// тесты проверяют только то, что срабатывает до обращения к сервису (middleware,
// разбор тела, маршрутизация).
func testRouter(t *testing.T, trusted []string, health func(context.Context) error) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{Env: config.EnvProduction, TrustedProxies: trusted}
	r, err := NewRouter(cfg, Deps{
		Tokens:   testTokens,
		Sessions: revokedSessions{},
		Auth:     handlers.NewAuthHandler(nil),
		Projects: handlers.NewProjectHandler(nil),
		Folders:  handlers.NewFolderHandler(nil),
		Layouts:  handlers.NewLayoutHandler(nil),
		Health:   health,
	})
	if err != nil {
		t.Fatalf("NewRouter: %v", err)
	}
	return r
}

func request(r http.Handler, method, path, body string, header map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range header {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func errorText(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %q", w.Body.String())
	}
	return body["error"]
}

func TestHealthReflectsDependencies(t *testing.T) {
	if w := request(testRouter(t, nil, nil), http.MethodGet, "/api/health", "", nil); w.Code != http.StatusOK {
		t.Fatalf("expected 200 without checks, got %d", w.Code)
	}

	var deadline bool
	failing := func(ctx context.Context) error {
		_, deadline = ctx.Deadline()
		return errors.New("mongo down")
	}
	w := request(testRouter(t, nil, failing), http.MethodGet, "/api/health", "", nil)
	if w.Code != http.StatusServiceUnavailable || strings.Contains(w.Body.String(), "mongo") {
		t.Fatalf("expected an opaque 503, got %d: %s", w.Code, w.Body.String())
	}
	if !deadline {
		t.Fatal("the health check must run with a deadline")
	}
}

func TestUnknownRouteIsJSON404(t *testing.T) {
	w := request(testRouter(t, nil, nil), http.MethodGet, "/api/nope", "", nil)
	if w.Code != http.StatusNotFound || errorText(t, w) != "not found" {
		t.Fatalf("expected JSON 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSecurityHeadersOnEveryResponse(t *testing.T) {
	w := request(testRouter(t, nil, nil), http.MethodGet, "/api/nope", "", nil)
	for header, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Cache-Control":          "no-store",
	} {
		if got := w.Header().Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}
}

func TestProtectedRoutesRequireToken(t *testing.T) {
	r := testRouter(t, nil, nil)
	for _, path := range []string{"/api/projects", "/api/folders", "/api/layouts", "/api/auth/me"} {
		if w := request(r, http.MethodGet, path, "", nil); w.Code != http.StatusUnauthorized {
			t.Errorf("GET %s: expected 401, got %d", path, w.Code)
		}
	}
}

// Токен со старой версией сессий (до сброса пароля) не открывает защищённые маршруты.
func TestProtectedRoutesRejectRevokedSessions(t *testing.T) {
	r := testRouter(t, nil, nil)
	old, _ := testTokens.Generate("u1", 0)
	for _, path := range []string{"/api/projects", "/api/folders", "/api/layouts", "/api/auth/me"} {
		w := request(r, http.MethodGet, path, "", map[string]string{"Authorization": "Bearer " + old})
		if w.Code != http.StatusUnauthorized || errorText(t, w) != "invalid or expired token" {
			t.Errorf("GET %s with a revoked session: expected 401, got %d %s", path, w.Code, w.Body.String())
		}
	}
}

// codePaths — маршруты с кодами подтверждения: у них общий лимит на IP.
var codePaths = []string{
	"/api/auth/send-code", "/api/auth/verify-code",
	"/api/auth/password/send-code", "/api/auth/password/reset",
}

// sendCodes шлёт n заведомо некорректных запросов кода (до сервиса они не доходят)
// с разными X-Forwarded-For по маршрутам с кодами и возвращает коды ответов.
func sendCodes(r http.Handler, n int) []int {
	codes := make([]int, n)
	for i := range codes {
		header := map[string]string{"X-Forwarded-For": fmt.Sprintf("203.0.113.%d", i+1)}
		codes[i] = request(r, http.MethodPost, codePaths[i%len(codePaths)], `{}`, header).Code
	}
	return codes
}

func TestCodeLimitIgnoresSpoofedForwardedFor(t *testing.T) {
	codes := sendCodes(testRouter(t, nil, nil), codesPerMinute+1)
	for i, code := range codes[:codesPerMinute] {
		if code != http.StatusBadRequest {
			t.Fatalf("request %d: expected 400 before the limit, got %d", i+1, code)
		}
	}
	if last := codes[codesPerMinute]; last != http.StatusTooManyRequests {
		t.Fatalf("a forged X-Forwarded-For must not bypass the limit, got %d", last)
	}
}

func TestCodeLimitTrustsConfiguredProxy(t *testing.T) {
	// httptest шлёт запросы с 192.0.2.1 — это доверенный прокси, клиент берётся из заголовка.
	for i, code := range sendCodes(testRouter(t, []string{"192.0.2.0/24"}, nil), codesPerMinute+1) {
		if code != http.StatusBadRequest {
			t.Fatalf("request %d: distinct clients behind a trusted proxy must not share a limit, got %d", i+1, code)
		}
	}
}

func TestNewRouterRequiresSessionChecker(t *testing.T) {
	if _, err := NewRouter(&config.Config{}, Deps{Tokens: testTokens}); err == nil {
		t.Fatal("without a session checker revoked tokens would pass — startup must fail")
	}
}

func TestNewRouterRejectsInvalidTrustedProxy(t *testing.T) {
	cfg := &config.Config{TrustedProxies: []string{"not-an-ip"}}
	if _, err := NewRouter(cfg, Deps{}); err == nil {
		t.Fatal("an invalid TRUSTED_PROXIES entry must fail startup")
	}
}
