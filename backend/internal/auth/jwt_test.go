package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestTokenGenerateAndParse(t *testing.T) {
	svc := NewTokenService("test-secret", time.Hour)

	token, err := svc.Generate("user-123", 0)
	if err != nil {
		t.Fatalf("Generate returned error: %v", err)
	}
	if token == "" {
		t.Fatal("Generate returned empty token")
	}

	claims, err := svc.Parse(token)
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if claims.UserID != "user-123" {
		t.Fatalf("expected userID user-123, got %q", claims.UserID)
	}
	if claims.Subject != "user-123" {
		t.Fatalf("expected subject user-123, got %q", claims.Subject)
	}
}

// Версия сессий пользователя попадает в токен: после сброса пароля старые токены
// отличаются от новых и отклоняются (см. middleware.Auth).
func TestTokenCarriesSessionVersion(t *testing.T) {
	svc := NewTokenService("test-secret", time.Hour)
	for _, version := range []int64{0, 1, 42} {
		token, err := svc.Generate("user-1", version)
		if err != nil {
			t.Fatalf("Generate(%d): %v", version, err)
		}
		claims, err := svc.Parse(token)
		if err != nil || claims.Version != version {
			t.Fatalf("expected version %d, got %+v (%v)", version, claims, err)
		}
	}
}

func TestParseRejectsWrongSecret(t *testing.T) {
	issuer := NewTokenService("secret-a", time.Hour)
	verifier := NewTokenService("secret-b", time.Hour)

	token, err := issuer.Generate("user-1", 0)
	if err != nil {
		t.Fatalf("Generate returned error: %v", err)
	}

	if _, err := verifier.Parse(token); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken for wrong secret, got %v", err)
	}
}

func TestParseRejectsTamperedToken(t *testing.T) {
	svc := NewTokenService("test-secret", time.Hour)

	token, err := svc.Generate("user-1", 0)
	if err != nil {
		t.Fatalf("Generate returned error: %v", err)
	}

	tampered := token + "x"
	if _, err := svc.Parse(tampered); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken for tampered token, got %v", err)
	}
}

func TestParseRejectsExpiredToken(t *testing.T) {
	// Отрицательный TTL → токен уже истёк в момент выпуска.
	svc := NewTokenService("test-secret", -time.Minute)

	token, err := svc.Generate("user-1", 0)
	if err != nil {
		t.Fatalf("Generate returned error: %v", err)
	}

	if _, err := svc.Parse(token); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken for expired token, got %v", err)
	}
}

func TestParseRejectsGarbage(t *testing.T) {
	svc := NewTokenService("test-secret", time.Hour)
	if _, err := svc.Parse("not-a-jwt"); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken for garbage, got %v", err)
	}
}

// Подпись другим HMAC-алгоритмом с тем же секретом и токен без срока не принимаются.
func TestParseRejectsOtherAlgorithmsAndMissingExpiry(t *testing.T) {
	secret := []byte("test-secret")
	svc := NewTokenService(string(secret), time.Hour)
	cases := map[string]jwt.Claims{
		"no expiry": Claims{UserID: "user-1"},
		"no user":   Claims{RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}},
	}
	for name, claims := range cases {
		token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
		if err != nil {
			t.Fatalf("%s: sign: %v", name, err)
		}
		if _, err := svc.Parse(token); err != ErrInvalidToken {
			t.Errorf("%s: expected ErrInvalidToken, got %v", name, err)
		}
	}

	valid := Claims{UserID: "user-1", RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}
	hs512, err := jwt.NewWithClaims(jwt.SigningMethodHS512, valid).SignedString(secret)
	if err != nil {
		t.Fatalf("sign HS512: %v", err)
	}
	if _, err := svc.Parse(hs512); err != ErrInvalidToken {
		t.Fatalf("only HS256 is accepted, got %v", err)
	}
	none, err := jwt.NewWithClaims(jwt.SigningMethodNone, valid).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("sign none: %v", err)
	}
	if _, err := svc.Parse(none); err != ErrInvalidToken {
		t.Fatalf("alg=none must be rejected, got %v", err)
	}
}
