package handlers

import (
	"net/http"
	"strings"
	"testing"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"golang.org/x/crypto/bcrypt"
)

const resetPurpose = models.VerificationPurposeResetPassword

func resetBody(email, code, password string) string {
	return `{"email":"` + email + `","code":"` + code + `","password":"` + password + `"}`
}

func TestPasswordResetEndpoints(t *testing.T) {
	r, users, vers := authEngine(t)

	w := do(r, http.MethodPost, "/auth/password/send-code", `{"email":" Old@Example.com "}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	body := decode(t, w)
	if body["message"] == "" || body["token"] != nil {
		t.Fatalf("expected a message without a token, got %v", body)
	}
	expectError(t, do(r, http.MethodPost, "/auth/password/send-code", `{"email":"old@example.com"}`),
		http.StatusTooManyRequests, "code was sent recently, wait 30 seconds before retrying")

	setKnownCode(t, vers, "old@example.com", resetPurpose, "123456")
	expectError(t, do(r, http.MethodPost, "/auth/password/reset", resetBody("old@example.com", "123456", "123")),
		http.StatusBadRequest, "password must be at least 6 characters")
	expectError(t, do(r, http.MethodPost, "/auth/password/reset", resetBody("old@example.com", "000000", "new-password-1")),
		http.StatusUnauthorized, "invalid verification code")

	w = do(r, http.MethodPost, "/auth/password/reset", resetBody("old@example.com", "123456", "new-password-1"))
	if w.Code != http.StatusOK || decode(t, w)["message"] == "" {
		t.Fatalf("expected 200 with a message, got %d: %s", w.Code, w.Body.String())
	}
	if bcrypt.CompareHashAndPassword([]byte(users.byID["u1"].PasswordHash), []byte("new-password-1")) != nil {
		t.Fatal("the new password must be stored")
	}
	if users.byID["u1"].TokenVersion != 1 {
		t.Fatal("the session version must grow")
	}

	expectError(t, do(r, http.MethodPost, "/auth/password/reset", resetBody("old@example.com", "123456", "new-password-2")),
		http.StatusUnauthorized, "verification code expired, request a new one")
	expectError(t, do(r, http.MethodPost, "/auth/login", `{"email":"old@example.com","password":"`+testPassword+`"}`),
		http.StatusUnauthorized, "invalid email or password")
	if w := do(r, http.MethodPost, "/auth/login", `{"email":"old@example.com","password":"new-password-1"}`); w.Code != http.StatusOK {
		t.Fatalf("login with the new password must work, got %d: %s", w.Code, w.Body.String())
	}
}

// На запрос кода для незарегистрированного адреса ответ такой же, как для своего.
func TestPasswordResetCodeSameResponseForUnknownEmail(t *testing.T) {
	r, _, _ := authEngine(t)
	known := do(r, http.MethodPost, "/auth/password/send-code", `{"email":"old@example.com"}`)
	unknown := do(r, http.MethodPost, "/auth/password/send-code", `{"email":"nobody@example.com"}`)
	if known.Code != unknown.Code || known.Body.String() != unknown.Body.String() {
		t.Fatalf("responses differ: %d %s vs %d %s", known.Code, known.Body.String(), unknown.Code, unknown.Body.String())
	}
}

func TestPasswordResetRequestValidation(t *testing.T) {
	r, _, _ := authEngine(t)
	cases := map[string]struct{ path, body, want string }{
		"no email":       {"/auth/password/send-code", `{}`, "invalid field: email"},
		"bad email":      {"/auth/password/send-code", `{"email":"nope"}`, "invalid email format"},
		"long email":     {"/auth/password/send-code", `{"email":"` + strings.Repeat("a", 250) + `@b.cd"}`, "invalid field: email"},
		"short code":     {"/auth/password/reset", resetBody("old@example.com", "12", "new-password-1"), "invalid field: code"},
		"no code":        {"/auth/password/reset", `{"email":"old@example.com","password":"new-password-1"}`, "invalid field: code"},
		"long password":  {"/auth/password/reset", resetBody("old@example.com", "123456", strings.Repeat("a", 73)), "password must be at most 72 bytes"},
		"reset bad mail": {"/auth/password/reset", resetBody("nope", "123456", "new-password-1"), "invalid email format"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			expectError(t, do(r, http.MethodPost, tc.path, tc.body), http.StatusBadRequest, tc.want)
		})
	}
}

func TestPasswordResetTooManyAttempts(t *testing.T) {
	r, _, vers := authEngine(t)
	if w := do(r, http.MethodPost, "/auth/password/send-code", `{"email":"old@example.com"}`); w.Code != http.StatusOK {
		t.Fatalf("send-code: %d %s", w.Code, w.Body.String())
	}
	setKnownCode(t, vers, "old@example.com", resetPurpose, "123456")
	wrong := resetBody("old@example.com", "000000", "new-password-1")
	for i := 0; i < 4; i++ {
		expectError(t, do(r, http.MethodPost, "/auth/password/reset", wrong), http.StatusUnauthorized, "invalid verification code")
	}
	expectError(t, do(r, http.MethodPost, "/auth/password/reset", wrong),
		http.StatusTooManyRequests, "too many invalid attempts, request a new code")

	// Новый код — ещё пять попыток; после десяти неверных кодов за час сброс закрыт.
	rec := vers.records[verificationKey("old@example.com", resetPurpose)]
	rec.Attempts = 0
	for i := 0; i < 5; i++ {
		_ = do(r, http.MethodPost, "/auth/password/reset", wrong)
	}
	rec.Attempts = 0
	expectError(t, do(r, http.MethodPost, "/auth/password/reset", resetBody("old@example.com", "123456", "new-password-1")),
		http.StatusTooManyRequests, "too many password reset attempts, try again later")
}
