package email

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/execada/VRHomeConstruction/backend/internal/config"
)

func TestNewSenderPicksBrevo(t *testing.T) {
	cfg := &config.Config{BrevoAPIKey: "xkeysib-test", BrevoFrom: "VR Home <noreply@example.com>"}
	if _, ok := NewSender(cfg).(*BrevoSender); !ok {
		t.Fatal("a Brevo key must select Brevo")
	}
}

func TestBrevoSenderSendsCode(t *testing.T) {
	var got struct {
		method, key, contentType string
		body                     map[string]interface{}
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.method, got.key, got.contentType = r.Method, r.Header.Get("api-key"), r.Header.Get("Content-Type")
		_ = json.NewDecoder(r.Body).Decode(&got.body)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"messageId":"<1@brevo>"}`))
	}))
	defer srv.Close()

	s := NewBrevoSender("xkeysib-test", "VR Home <noreply@example.com>")
	s.endpoint = srv.URL
	if err := s.SendVerificationCode("user@example.com", "445566", "регистрации"); err != nil {
		t.Fatalf("send: %v", err)
	}
	if got.method != http.MethodPost || got.key != "xkeysib-test" || got.contentType != "application/json" || s.LogOnly() {
		t.Fatalf("unexpected request %s key=%q type=%q", got.method, got.key, got.contentType)
	}
	sender, _ := got.body["sender"].(map[string]interface{})
	to, _ := got.body["to"].([]interface{})
	text, _ := got.body["textContent"].(string)
	if sender["email"] != "noreply@example.com" || sender["name"] != "VR Home" || len(to) != 1 || !strings.Contains(text, "445566") {
		t.Fatalf("unexpected payload %v", got.body)
	}
}

func TestBrevoSenderReportsFailures(t *testing.T) {
	cases := map[string]struct {
		status int
		body   string
		want   string
	}{
		"api message": {http.StatusUnauthorized, `{"code":"unauthorized","message":"Key not found"}`, "brevo api: Key not found"},
		"bare status": {http.StatusBadRequest, `oops`, "brevo api: 400 Bad Request"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			s := NewBrevoSender("xkeysib-test", "noreply@example.com")
			s.endpoint = srv.URL
			if err := s.SendVerificationCode("user@example.com", "445566", "регистрации"); err == nil || err.Error() != tc.want {
				t.Fatalf("expected %q, got %v", tc.want, err)
			}
		})
	}
}

func TestBrevoSenderRejectsBadInput(t *testing.T) {
	s := NewBrevoSender("xkeysib-test", "not an address")
	if err := s.SendVerificationCode("user@example.com", "445566", "регистрации"); err == nil || !strings.Contains(err.Error(), "BREVO_FROM") {
		t.Fatalf("an invalid sender must be reported, got %v", err)
	}
	ok := NewBrevoSender("xkeysib-test", "noreply@example.com")
	if err := ok.SendVerificationCode("a@example.com\r\nBcc: all@example.com", "445566", "регистрации"); !errors.Is(err, errInvalidRecipient) {
		t.Fatalf("header injection must be rejected, got %v", err)
	}
	ok.endpoint = "http://127.0.0.1:1"
	if err := ok.SendVerificationCode("user@example.com", "445566", "регистрации"); err == nil || !strings.Contains(err.Error(), "brevo request") {
		t.Fatalf("an unreachable API must be reported, got %v", err)
	}
}
