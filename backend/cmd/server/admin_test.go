package main

import (
	"io"
	"os"
	"strings"
	"testing"
)

func TestParseAdminArgs(t *testing.T) {
	got, err := parseAdminArgs([]string{"--login", "execada", "--email", "a@example.com", "--name", "Владелец"}, io.Discard)
	if err != nil || got.login != "execada" || got.email != "a@example.com" || got.name != "Владелец" {
		t.Fatalf("unexpected parse result %+v (%v)", got, err)
	}
	if _, err := parseAdminArgs(nil, io.Discard); err == nil || !strings.Contains(err.Error(), "--login") {
		t.Fatalf("a missing login must be reported, got %v", err)
	}
	if _, err := parseAdminArgs([]string{"--unknown"}, io.Discard); err == nil {
		t.Fatal("unknown flags must be rejected")
	}
}

// Не терминал (pipe): пароль — первая строка stdin, без перевода строки.
func TestReadPasswordFromPipe(t *testing.T) {
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	go func() {
		_, _ = w.WriteString("s3cret-pass\r\nignored\n")
		_ = w.Close()
	}()
	defer r.Close()

	got, err := readPassword(r, io.Discard)
	if err != nil || got != "s3cret-pass" {
		t.Fatalf("expected the first line, got %q (%v)", got, err)
	}
}
