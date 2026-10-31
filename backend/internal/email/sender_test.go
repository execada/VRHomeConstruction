package email

import (
	"bufio"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/config"
)

func TestNewSenderPicksProvider(t *testing.T) {
	if _, ok := NewSender(&config.Config{ResendAPIKey: "re_test"}).(*ResendSender); !ok {
		t.Fatal("an API key must select Resend")
	}
	if _, ok := NewSender(&config.Config{}).(*Mailer); !ok {
		t.Fatal("without an API key SMTP is used")
	}
}

func TestMailerLogOnlyMode(t *testing.T) {
	cases := []struct {
		cfg  config.SMTPConfig
		want bool
	}{
		{config.SMTPConfig{}, true},
		{config.SMTPConfig{Enabled: true, LogOnly: true}, true},
		{config.SMTPConfig{Enabled: true}, false},
	}
	for _, tc := range cases {
		if got := NewMailer(tc.cfg).LogOnly(); got != tc.want {
			t.Errorf("LogOnly(%+v) = %v, want %v", tc.cfg, got, tc.want)
		}
	}
	if err := NewMailer(config.SMTPConfig{}).SendVerificationCode("a@example.com", "123456", "регистрации"); err != nil {
		t.Fatalf("log-only sending must not touch the network, got %v", err)
	}
}

func TestSendersRejectHeaderInjection(t *testing.T) {
	for name, s := range map[string]Sender{
		"smtp":   NewMailer(config.SMTPConfig{}),
		"resend": NewResendSender("re_test", ""),
	} {
		for _, to := range []string{"", "victim@example.com\r\nBcc: all@example.com", "a@example.com\n"} {
			if err := s.SendVerificationCode(to, "123456", "регистрации"); !errors.Is(err, errInvalidRecipient) {
				t.Errorf("%s: %q must be rejected, got %v", name, to, err)
			}
		}
	}
}

func TestIsLocalSMTP(t *testing.T) {
	for host, want := range map[string]bool{
		"localhost": true, "127.0.0.1": true, "::1": true,
		"smtp.gmail.com": false, "10.0.0.5": false, "": false,
	} {
		if got := isLocalSMTP(host); got != want {
			t.Errorf("isLocalSMTP(%q) = %v, want %v", host, got, want)
		}
	}
}

// startFakeSMTP поднимает на 127.0.0.1 минимальный SMTP-сервер на одно письмо
// (без STARTTLS — это допустимо только для локального хоста) и отдаёт текст письма.
func startFakeSMTP(t *testing.T) (host, port string, messages <-chan string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	out := make(chan string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		serveSMTP(conn, out)
	}()
	host, port, _ = net.SplitHostPort(ln.Addr().String())
	return host, port, out
}

func serveSMTP(conn net.Conn, out chan<- string) {
	reader := bufio.NewReader(conn)
	reply := func(s string) { _, _ = conn.Write([]byte(s + "\r\n")) }
	reply("220 fake ESMTP")

	var data strings.Builder
	inData := false
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		if inData {
			if line == ".\r\n" {
				inData = false
				out <- data.String()
				reply("250 queued")
			} else {
				data.WriteString(line)
			}
			continue
		}
		switch cmd := strings.ToUpper(strings.TrimSpace(line)); {
		case strings.HasPrefix(cmd, "EHLO"):
			reply("250-fake\r\n250 AUTH PLAIN")
		case strings.HasPrefix(cmd, "AUTH PLAIN"):
			reply("235 authenticated")
		case strings.HasPrefix(cmd, "MAIL FROM"), strings.HasPrefix(cmd, "RCPT TO"):
			reply("250 ok")
		case cmd == "DATA":
			inData = true
			reply("354 go ahead")
		case cmd == "QUIT":
			reply("221 bye")
			return
		default:
			reply("502 not implemented")
		}
	}
}

func TestMailerDeliversOverSMTP(t *testing.T) {
	host, port, messages := startFakeSMTP(t)
	m := NewMailer(config.SMTPConfig{Enabled: true, Host: host, Port: port, User: "sender@example.com", Password: "app-password"})

	if err := m.SendVerificationCode("user@example.com", "654321", "регистрации"); err != nil {
		t.Fatalf("send: %v", err)
	}
	select {
	case msg := <-messages:
		for _, want := range []string{"From: sender@example.com", "To: user@example.com", "Subject: Код подтверждения", "654321", "регистрации"} {
			if !strings.Contains(msg, want) {
				t.Errorf("message lacks %q:\n%s", want, msg)
			}
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the message never reached the server")
	}
}

func TestMailerErrorsHideRecipientAndCode(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	_, closedPort, _ := net.SplitHostPort(ln.Addr().String())
	_ = ln.Close()

	for _, port := range []string{closedPort, "465"} {
		m := NewMailer(config.SMTPConfig{Enabled: true, Host: "127.0.0.1", Port: port})
		err := m.SendVerificationCode("user@example.com", "987654", "регистрации")
		if err == nil {
			t.Fatalf("port %s: expected a delivery error", port)
		}
		if msg := err.Error(); strings.Contains(msg, "user@example.com") || strings.Contains(msg, "987654") {
			t.Fatalf("port %s: the error must not reveal the address or the code: %v", port, err)
		}
	}
}

func TestResendSenderSendsCode(t *testing.T) {
	var auth string
	var payload map[string]interface{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&payload)
		_, _ = w.Write([]byte(`{"id":"1"}`))
	}))
	defer srv.Close()

	s := NewResendSender("re_test_key", "")
	s.endpoint = srv.URL
	if err := s.SendVerificationCode("user@example.com", "112233", "регистрации"); err != nil {
		t.Fatalf("send: %v", err)
	}
	if auth != "Bearer re_test_key" || s.LogOnly() {
		t.Fatalf("unexpected auth header %q", auth)
	}
	text, _ := payload["text"].(string)
	if !strings.Contains(text, "112233") || payload["from"] != "VR Home <onboarding@resend.dev>" {
		t.Fatalf("unexpected payload %v", payload)
	}
}

func TestResendSenderReportsFailures(t *testing.T) {
	cases := map[string]struct {
		status int
		body   string
		want   string
	}{
		"api message": {http.StatusUnprocessableEntity, `{"message":"invalid from"}`, "resend api: invalid from"},
		"bare status": {http.StatusInternalServerError, `oops`, "resend api: 500 Internal Server Error"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			s := NewResendSender("re_test_key", "VR <noreply@example.com>")
			s.endpoint = srv.URL
			if err := s.SendVerificationCode("user@example.com", "112233", "регистрации"); err == nil || err.Error() != tc.want {
				t.Fatalf("expected %q, got %v", tc.want, err)
			}
		})
	}

	s := NewResendSender("re_test_key", "")
	s.endpoint = "http://127.0.0.1:1"
	if err := s.SendVerificationCode("user@example.com", "112233", "регистрации"); err == nil || !strings.Contains(err.Error(), "resend request") {
		t.Fatalf("an unreachable API must be reported, got %v", err)
	}
}
