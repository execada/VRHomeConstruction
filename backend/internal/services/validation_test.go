package services

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

const testThumbnail = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD="

func assertValidationErr(t *testing.T, err, kind error) {
	t.Helper()
	if !errors.Is(err, kind) {
		t.Fatalf("expected %v, got %v", kind, err)
	}
	if !IsValidationError(err) {
		t.Fatalf("expected a validation error, got %T", err)
	}
	if err.Error() == "" {
		t.Fatal("validation error must carry a human readable reason")
	}
}

func TestNormalizeName(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		max     int
		want    string
		wantErr bool
	}{
		{"trims surrounding spaces", "  Кухня  ", maxProjectNameLen, "Кухня", false},
		{"empty", "", maxProjectNameLen, "", true},
		{"whitespace only", " \t\n ", maxProjectNameLen, "", true},
		{"exactly max runes", strings.Repeat("я", 120), maxProjectNameLen, strings.Repeat("я", 120), false},
		{"over max runes", strings.Repeat("я", 121), maxProjectNameLen, "", true},
		{"user name max", strings.Repeat("a", 60), maxUserNameLen, strings.Repeat("a", 60), false},
		{"user name over max", strings.Repeat("a", 61), maxUserNameLen, "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizeName(tc.in, tc.max)
			if tc.wantErr {
				assertValidationErr(t, err, ErrInvalidName)
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestNormalizeDescription(t *testing.T) {
	if got, err := normalizeDescription("  описание \n"); err != nil || got != "описание" {
		t.Fatalf("expected trimmed description, got %q (%v)", got, err)
	}
	if got, err := normalizeDescription(""); err != nil || got != "" {
		t.Fatalf("empty description must be allowed, got %q (%v)", got, err)
	}
	if _, err := normalizeDescription(strings.Repeat("ж", 500)); err != nil {
		t.Fatalf("500 runes must be allowed, got %v", err)
	}
	_, err := normalizeDescription(strings.Repeat("ж", 501))
	assertValidationErr(t, err, ErrInvalidDescription)
}

func TestNormalizeTags(t *testing.T) {
	t.Run("nil becomes empty slice", func(t *testing.T) {
		got, err := normalizeTags(nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got == nil || len(got) != 0 {
			t.Fatalf("expected non-nil empty slice, got %#v", got)
		}
	})

	t.Run("trims and deduplicates case-insensitively", func(t *testing.T) {
		got, err := normalizeTags([]string{" кухня ", "Лофт", "КУХНЯ", "лофт", "свет"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := []string{"кухня", "Лофт", "свет"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v, want %#v", got, want)
		}
	})

	t.Run("duplicates do not count towards the limit", func(t *testing.T) {
		raw := []string{"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "A", "b "}
		got, err := normalizeTags(raw)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(got) != maxTags {
			t.Fatalf("expected %d unique tags, got %d", maxTags, len(got))
		}
	})

	t.Run("does not alias the input", func(t *testing.T) {
		raw := []string{"a", "b"}
		got, _ := normalizeTags(raw)
		got[0] = "changed"
		if raw[0] != "a" {
			t.Fatal("normalizeTags must return a new slice")
		}
	})

	bad := map[string][]string{
		"too many":     {"1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"},
		"empty tag":    {"ok", "   "},
		"too long tag": {strings.Repeat("т", 33)},
	}
	for name, raw := range bad {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeTags(raw)
			assertValidationErr(t, err, ErrInvalidTags)
		})
	}

	if _, err := normalizeTags([]string{strings.Repeat("т", 32)}); err != nil {
		t.Fatalf("32-rune tag must be allowed, got %v", err)
	}
}

func TestValidateThumbnail(t *testing.T) {
	valid := []string{
		"",
		testThumbnail,
		"data:image/png;base64,iVBORw0KGgo=",
		"data:image/webp;base64,UklGRg+/",
		"data:image/png;base64," + strings.Repeat("A", maxThumbnailLen-len("data:image/png;base64,")),
	}
	for _, v := range valid {
		if got, err := validateThumbnail(v); err != nil || got != v {
			t.Errorf("expected %.40q to be valid, got %v", v, err)
		}
	}

	invalid := map[string]string{
		"gif":            "data:image/gif;base64,R0lGOD",
		"svg":            "data:image/svg+xml;base64,PHN2Zz4=",
		"not data url":   "https://example.com/a.png",
		"no base64 flag": "data:image/png,iVBORw0KGgo=",
		"upper case":     "DATA:IMAGE/PNG;BASE64,iVBORw0KGgo=",
		"empty payload":  "data:image/png;base64,",
		"bad characters": "data:image/png;base64,abc)\"<script>",
		"whitespace":     " data:image/png;base64,iVBORw0KGgo=",
		"too long":       "data:image/png;base64," + strings.Repeat("A", maxThumbnailLen),
	}
	for name, v := range invalid {
		t.Run(name, func(t *testing.T) {
			_, err := validateThumbnail(v)
			assertValidationErr(t, err, ErrInvalidThumbnail)
		})
	}
}

func TestNormalizeStatus(t *testing.T) {
	if got, err := normalizeStatus(" active "); err != nil || got != "active" {
		t.Fatalf("expected trimmed status, got %q (%v)", got, err)
	}
	for _, bad := range []string{"", "   ", strings.Repeat("s", maxStatusLen+1)} {
		_, err := normalizeStatus(bad)
		assertValidationErr(t, err, ErrInvalidStatus)
	}
}

func TestValidateEmailFormat(t *testing.T) {
	for _, ok := range []string{"user@example.com", "first.last+tag@sub.example.co", "иван@пример.рф"} {
		if err := validateEmailFormat(ok); err != nil {
			t.Errorf("expected %q to be valid, got %v", ok, err)
		}
	}
	bad := []string{
		"", "plain", "a@b", "@example.com", "user@", "user@.com", "user@example.",
		"Name <user@example.com>", "user name@example.com", "a@b@c.com",
		strings.Repeat("a", 250) + "@example.com",
	}
	for _, v := range bad {
		err := validateEmailFormat(v)
		if !errors.Is(err, ErrInvalidEmail) || !IsValidationError(err) {
			t.Errorf("expected %q to be rejected, got %v", v, err)
		}
	}
}

func TestDuplicateName(t *testing.T) {
	if got := duplicateName("Гостиная"); got != "Гостиная (копия)" {
		t.Fatalf("unexpected copy name %q", got)
	}

	long := strings.Repeat("д", maxProjectNameLen)
	got := duplicateName(long)
	if n := utf8.RuneCountInString(got); n != maxProjectNameLen {
		t.Fatalf("expected copy name truncated to %d runes, got %d", maxProjectNameLen, n)
	}
	if !strings.HasSuffix(got, copyNameSuffix) {
		t.Fatalf("copy suffix must survive truncation, got %q", got)
	}

	if got := duplicateName("   "); got != strings.TrimSpace(copyNameSuffix) {
		t.Fatalf("blank source name should yield bare suffix, got %q", got)
	}
}

func TestNormalizePagination(t *testing.T) {
	cases := []struct {
		page, limit         int64
		wantPage, wantLimit int64
	}{
		{1, 20, 1, 20},
		{0, 0, 1, 1},
		{-3, -10, 1, 1},
		{2, 1000, 2, maxPageLimit},
		{maxPage + 1, 50, maxPage, 50},
	}
	for _, tc := range cases {
		page, limit := NormalizePagination(tc.page, tc.limit)
		if page != tc.wantPage || limit != tc.wantLimit {
			t.Errorf("NormalizePagination(%d,%d) = (%d,%d), want (%d,%d)",
				tc.page, tc.limit, page, limit, tc.wantPage, tc.wantLimit)
		}
	}
}
