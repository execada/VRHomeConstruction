package middleware

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func newTestRouter(mw ...gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(mw...)
	return r
}

// echoLength читает тело целиком и отвечает его длиной (или 413 при превышении лимита).
func echoLength(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		if IsBodyTooLarge(err) {
			RespondBodyTooLarge(c)
			return
		}
		c.Status(http.StatusInternalServerError)
		return
	}
	c.String(http.StatusOK, "%d", len(body))
}

func assertTooLarge(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", w.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body["error"] != "request body too large" {
		t.Fatalf("unexpected body %q (%v)", w.Body.String(), err)
	}
}

func TestBodyLimitRejectsDeclaredOversizedBody(t *testing.T) {
	r := newTestRouter(BodyLimit(16))
	r.POST("/echo", echoLength)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/echo", strings.NewReader(strings.Repeat("x", 17))))
	assertTooLarge(t, w)
}

func TestBodyLimitRejectsChunkedOversizedBody(t *testing.T) {
	r := newTestRouter(BodyLimit(16))
	r.POST("/echo", echoLength)

	req := httptest.NewRequest(http.MethodPost, "/echo", strings.NewReader(strings.Repeat("x", 17)))
	req.ContentLength = -1 // длина не заявлена (chunked) — срабатывает MaxBytesReader
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assertTooLarge(t, w)
}

func TestBodyLimitAllowsBodyWithinLimit(t *testing.T) {
	r := newTestRouter(BodyLimit(16))
	r.POST("/echo", echoLength)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/echo", strings.NewReader(strings.Repeat("x", 16))))
	if w.Code != http.StatusOK || w.Body.String() != "16" {
		t.Fatalf("expected 200 with full body, got %d %q", w.Code, w.Body.String())
	}
}

func TestIsBodyTooLarge(t *testing.T) {
	if IsBodyTooLarge(errors.New("boom")) || IsBodyTooLarge(nil) {
		t.Fatal("unrelated errors must not be reported as too large")
	}
	if !IsBodyTooLarge(fmt.Errorf("decode: %w", &http.MaxBytesError{Limit: 1})) {
		t.Fatal("wrapped MaxBytesError must be detected")
	}
}

func TestSecurityHeaders(t *testing.T) {
	r := newTestRouter(SecurityHeaders())
	r.GET("/ok", func(c *gin.Context) { c.Status(http.StatusOK) })

	for _, path := range []string{"/ok", "/missing"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		want := map[string]string{
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options":        "DENY",
			"Referrer-Policy":        "strict-origin-when-cross-origin",
		}
		for header, value := range want {
			if got := w.Header().Get(header); got != value {
				t.Errorf("%s: expected %s=%q, got %q", path, header, value, got)
			}
		}
	}
}

func TestCORSPreflightAllowsPatch(t *testing.T) {
	r := newTestRouter(CORS([]string{"https://app.example.com"}))
	r.PATCH("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodOptions, "/x", nil)
	req.Header.Set("Origin", "https://app.example.com")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for preflight, got %d", w.Code)
	}
	if !strings.Contains(w.Header().Get("Access-Control-Allow-Methods"), "PATCH") {
		t.Fatalf("PATCH must be allowed, got %q", w.Header().Get("Access-Control-Allow-Methods"))
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "https://app.example.com" {
		t.Fatal("expected the configured origin to be echoed")
	}
}

func TestRateLimitReturnsRetryAfter(t *testing.T) {
	r := newTestRouter(RateLimit(2, time.Minute))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	codes := make([]int, 0, 3)
	var last *httptest.ResponseRecorder
	for i := 0; i < 3; i++ {
		last = httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = "203.0.113.7:5000"
		r.ServeHTTP(last, req)
		codes = append(codes, last.Code)
	}
	if fmt.Sprint(codes) != "[200 200 429]" {
		t.Fatalf("unexpected codes %v", codes)
	}
	if ra := last.Header().Get("Retry-After"); ra == "" || ra == "0" {
		t.Fatalf("429 must carry Retry-After, got %q", ra)
	}
}

// X-Forwarded-For от недоверенного источника не должен менять ключ лимитера.
func TestRateLimitIgnoresSpoofedForwardedFor(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	if err := r.SetTrustedProxies(nil); err != nil {
		t.Fatal(err)
	}
	r.Use(RateLimit(3, time.Minute))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	limited := 0
	for i := 0; i < 20; i++ {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = "198.51.100.9:4000"
		req.Header.Set("X-Forwarded-For", fmt.Sprintf("10.0.0.%d", i))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code == http.StatusTooManyRequests {
			limited++
		}
	}
	if limited != 17 {
		t.Fatalf("spoofed X-Forwarded-For bypassed the limiter: %d of 20 limited", limited)
	}
}

func TestRateLimitByUserAndWritesOnly(t *testing.T) {
	r := newTestRouter(func(c *gin.Context) { c.Set(ContextUserIDKey, c.GetHeader("X-User")); c.Next() })
	r.Use(WritesOnly(RateLimitBy(1, time.Minute, ByUserID)))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.POST("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	do := func(method, user string) int {
		req := httptest.NewRequest(method, "/x", nil)
		req.Header.Set("X-User", user)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if do(http.MethodPost, "u1") != http.StatusOK || do(http.MethodPost, "u1") != http.StatusTooManyRequests {
		t.Fatal("second write of the same user must be limited")
	}
	if do(http.MethodPost, "u2") != http.StatusOK {
		t.Fatal("other users must not share the bucket")
	}
	if do(http.MethodGet, "u1") != http.StatusOK || do(http.MethodGet, "u1") != http.StatusOK {
		t.Fatal("reads must not be limited by the write limiter")
	}
	if do(http.MethodPost, "") != http.StatusOK {
		t.Fatal("empty key must not be limited")
	}
}

func TestRateLimiterSweepsOldWindows(t *testing.T) {
	l := newRateLimiter(1, time.Minute)
	now := time.Unix(1_000_000, 0)
	l.now = func() time.Time { return now }
	l.hit("a")
	l.hit("b")
	now = now.Add(2 * time.Minute)
	if wait := l.hit("c"); wait != 0 {
		t.Fatalf("new key must pass, wait=%v", wait)
	}
	if len(l.buckets) != 1 {
		t.Fatalf("expired buckets must be swept, have %d", len(l.buckets))
	}
}

func TestRequestTimeoutSetsDeadline(t *testing.T) {
	r := newTestRouter(RequestTimeout(time.Second))
	r.GET("/x", func(c *gin.Context) {
		if _, ok := c.Request.Context().Deadline(); !ok {
			c.Status(http.StatusInternalServerError)
			return
		}
		c.Status(http.StatusOK)
	})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))
	if w.Code != http.StatusOK {
		t.Fatal("request context must have a deadline")
	}
}
