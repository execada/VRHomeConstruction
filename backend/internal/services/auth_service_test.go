package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

// testRegToken — токен заявки на регистрацию, к которому привязаны тестовые записи.
const testRegToken = "registration-request-token"

func newAuthService() (*AuthService, *fakeUserRepo, *fakeVerificationRepo) {
	users := newFakeUserRepo()
	vers := newFakeVerificationRepo()
	tokens := auth.NewTokenService("test-secret", time.Hour)
	svc := NewAuthService(users, vers, tokens, &fakeSender{logOnly: true})
	return svc, users, vers
}

func hash(t *testing.T, s string) string {
	t.Helper()
	h, err := bcrypt.GenerateFromPassword([]byte(s), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("bcrypt failed: %v", err)
	}
	return string(h)
}

func TestNormalizeEmail(t *testing.T) {
	cases := map[string]string{
		"  User@Example.COM ": "user@example.com",
		"a@b.c":               "a@b.c",
		"\tMixed@Case.io\n":   "mixed@case.io",
	}
	for in, want := range cases {
		if got := normalizeEmail(in); got != want {
			t.Errorf("normalizeEmail(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestGenerateCode(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 20; i++ {
		code, err := generateCode()
		if err != nil {
			t.Fatalf("generateCode error: %v", err)
		}
		if len(code) != 6 {
			t.Fatalf("expected 6-digit code, got %q", code)
		}
		for _, r := range code {
			if r < '0' || r > '9' {
				t.Fatalf("code contains non-digit: %q", code)
			}
		}
		seen[code] = true
	}
	// 20 случайных кодов почти наверняка не совпадут все до единого.
	if len(seen) < 2 {
		t.Errorf("generateCode looks non-random: only %d unique values", len(seen))
	}
}

func TestSendCodeRegisterStoresPendingUser(t *testing.T) {
	svc, _, vers := newAuthService()

	resp, err := svc.SendCode(context.Background(), models.SendCodeRequest{
		Email:    "New@Example.com",
		Purpose:  models.VerificationPurposeRegister,
		Name:     "Иван",
		Password: "secret1",
	})
	if err != nil {
		t.Fatalf("SendCode failed: %v", err)
	}
	if resp == nil || resp.Message == "" {
		t.Fatal("expected a non-empty response message")
	}

	rec := vers.records[verKey("new@example.com", models.VerificationPurposeRegister)]
	if rec == nil {
		t.Fatal("expected a verification record to be stored")
	}
	if rec.Name != "Иван" {
		t.Errorf("expected name stored, got %q", rec.Name)
	}
	if rec.PasswordHash == "" {
		t.Error("expected password hash to be stored on the pending record")
	}
}

func TestSendCodeRegisterRejectsExistingEmail(t *testing.T) {
	svc, users, _ := newAuthService()
	users.byEmail["taken@example.com"] = &models.User{ID: "u1", Email: "taken@example.com"}

	_, err := svc.SendCode(context.Background(), models.SendCodeRequest{
		Email:    "taken@example.com",
		Purpose:  models.VerificationPurposeRegister,
		Name:     "X",
		Password: "secret1",
	})
	if err != ErrUserAlreadyExists {
		t.Fatalf("expected ErrUserAlreadyExists, got %v", err)
	}
}

func TestSendCodeRegisterValidation(t *testing.T) {
	svc, _, _ := newAuthService()
	ctx := context.Background()

	if _, err := svc.SendCode(ctx, models.SendCodeRequest{
		Email: "a@b.c", Purpose: models.VerificationPurposeRegister, Name: "", Password: "secret1",
	}); err == nil {
		t.Error("expected error for empty name")
	}

	if _, err := svc.SendCode(ctx, models.SendCodeRequest{
		Email: "a@b.c", Purpose: models.VerificationPurposeRegister, Name: "X", Password: "123",
	}); err == nil {
		t.Error("expected error for short password")
	}
}

func TestLoginSuccess(t *testing.T) {
	svc, users, _ := newAuthService()
	users.byEmail["u@example.com"] = &models.User{
		ID: "u1", Email: "u@example.com", Name: "U", PasswordHash: hash(t, "correct-password"),
	}

	resp, err := svc.Login(context.Background(), models.LoginRequest{
		Email: " U@Example.com ", Password: "correct-password",
	})
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if resp.User.ID != "u1" {
		t.Errorf("expected user u1, got %q", resp.User.ID)
	}

	// Возвращённый токен должен валидироваться и содержать userID.
	claims, err := auth.NewTokenService("test-secret", time.Hour).Parse(resp.Token)
	if err != nil {
		t.Fatalf("returned token should be valid: %v", err)
	}
	if claims.UserID != "u1" {
		t.Errorf("expected token userID u1, got %q", claims.UserID)
	}
}

func TestLoginWrongPassword(t *testing.T) {
	svc, users, _ := newAuthService()
	users.byEmail["u@example.com"] = &models.User{
		ID: "u1", Email: "u@example.com", PasswordHash: hash(t, "correct-password"),
	}

	_, err := svc.Login(context.Background(), models.LoginRequest{
		Email: "u@example.com", Password: "wrong-password",
	})
	if err != ErrInvalidCredentials {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLoginUnknownUser(t *testing.T) {
	svc, _, _ := newAuthService()
	_, err := svc.Login(context.Background(), models.LoginRequest{
		Email: "ghost@example.com", Password: "whatever",
	})
	if err != ErrInvalidCredentials {
		t.Fatalf("expected ErrInvalidCredentials for unknown user, got %v", err)
	}
}

func TestSendCodeRejectsUnknownPurpose(t *testing.T) {
	svc, _, _ := newAuthService()
	_, err := svc.SendCode(context.Background(), models.SendCodeRequest{
		Email: "u@example.com", Purpose: "login", Password: "whatever",
	})
	if err != ErrInvalidPurpose {
		t.Fatalf("expected ErrInvalidPurpose, got %v", err)
	}
}

func TestVerifyCodeRegisterCreatesUser(t *testing.T) {
	svc, users, vers := newAuthService()
	ctx := context.Background()

	vers.records[verKey("new@example.com", models.VerificationPurposeRegister)] = &models.VerificationRecord{
		ID:           primitive.NewObjectID().Hex(),
		Email:        "new@example.com",
		Purpose:      models.VerificationPurposeRegister,
		CodeHash:     hash(t, "123456"),
		Name:         "Иван",
		PasswordHash: hash(t, "secret1"),
		ExpiresAt:    time.Now().Add(5 * time.Minute), TokenHash: hashRequestToken(testRegToken),
	}

	resp, err := svc.VerifyCode(ctx, models.VerifyCodeRequest{
		Email: "new@example.com", Code: "123456", Purpose: models.VerificationPurposeRegister, Token: testRegToken,
	})
	if err != nil {
		t.Fatalf("VerifyCode failed: %v", err)
	}
	if resp.Token == "" {
		t.Error("expected a token to be returned")
	}
	if resp.User.Email != "new@example.com" || resp.User.Name != "Иван" {
		t.Errorf("unexpected user in response: %+v", resp.User)
	}
	if users.byEmail["new@example.com"] == nil {
		t.Error("expected user to be persisted")
	}
	if !vers.deleted {
		t.Error("expected the verification record to be consumed (deleted)")
	}
}

func TestVerifyCodeWrongCode(t *testing.T) {
	svc, _, vers := newAuthService()
	vers.records[verKey("a@b.c", models.VerificationPurposeRegister)] = &models.VerificationRecord{
		Email: "a@b.c", Purpose: models.VerificationPurposeRegister,
		CodeHash: hash(t, "123456"), Name: "X", PasswordHash: hash(t, "secret1"),
		ExpiresAt: time.Now().Add(5 * time.Minute), TokenHash: hashRequestToken(testRegToken),
	}

	_, err := svc.VerifyCode(context.Background(), models.VerifyCodeRequest{
		Email: "a@b.c", Code: "000000", Purpose: models.VerificationPurposeRegister, Token: testRegToken,
	})
	if err != ErrInvalidCode {
		t.Fatalf("expected ErrInvalidCode, got %v", err)
	}
}

func TestVerifyCodeExpired(t *testing.T) {
	svc, _, vers := newAuthService()
	vers.records[verKey("a@b.c", models.VerificationPurposeRegister)] = &models.VerificationRecord{
		Email: "a@b.c", Purpose: models.VerificationPurposeRegister,
		CodeHash: hash(t, "123456"), ExpiresAt: time.Now().Add(-time.Minute), TokenHash: hashRequestToken(testRegToken),
	}

	_, err := svc.VerifyCode(context.Background(), models.VerifyCodeRequest{
		Email: "a@b.c", Code: "123456", Purpose: models.VerificationPurposeRegister, Token: testRegToken,
	})
	if err != ErrCodeExpired {
		t.Fatalf("expected ErrCodeExpired, got %v", err)
	}
}

func TestVerifyCodeTooManyAttempts(t *testing.T) {
	svc, _, vers := newAuthService()
	vers.records[verKey("a@b.c", models.VerificationPurposeRegister)] = &models.VerificationRecord{
		Email: "a@b.c", Purpose: models.VerificationPurposeRegister,
		CodeHash: hash(t, "123456"), Name: "X", PasswordHash: hash(t, "secret1"),
		ExpiresAt: time.Now().Add(5 * time.Minute), TokenHash: hashRequestToken(testRegToken),
	}

	req := models.VerifyCodeRequest{
		Email: "a@b.c", Code: "000000", Purpose: models.VerificationPurposeRegister, Token: testRegToken,
	}

	// Первые maxCodeAttempts-1 неудачных попыток — ErrInvalidCode.
	for i := 0; i < maxCodeAttempts-1; i++ {
		if _, err := svc.VerifyCode(context.Background(), req); err != ErrInvalidCode {
			t.Fatalf("attempt %d: expected ErrInvalidCode, got %v", i+1, err)
		}
	}

	// Последняя попытка исчерпывает лимит и аннулирует код.
	if _, err := svc.VerifyCode(context.Background(), req); err != ErrTooManyAttempts {
		t.Fatalf("expected ErrTooManyAttempts, got %v", err)
	}

	// Даже правильный код после исчерпания попыток не проходит.
	req.Code = "123456"
	if _, err := svc.VerifyCode(context.Background(), req); err != ErrTooManyAttempts {
		t.Fatalf("expected ErrTooManyAttempts after exhaustion, got %v", err)
	}
}

func TestSendCodeResendCooldown(t *testing.T) {
	svc, _, _ := newAuthService()

	req := models.SendCodeRequest{
		Email:    "new@example.com",
		Purpose:  models.VerificationPurposeRegister,
		Name:     "Иван",
		Password: "secret1",
	}

	if _, err := svc.SendCode(context.Background(), req); err != nil {
		t.Fatalf("first SendCode failed: %v", err)
	}

	// Немедленный повтор упирается в кулдаун.
	if _, err := svc.SendCode(context.Background(), req); err != ErrCodeResendTooSoon {
		t.Fatalf("expected ErrCodeResendTooSoon, got %v", err)
	}
}

func TestSendCodeRegisterLeavesUserIDEmpty(t *testing.T) {
	svc, _, vers := newAuthService()
	if _, err := svc.SendCode(context.Background(), models.SendCodeRequest{
		Email: "new@example.com", Purpose: models.VerificationPurposeRegister, Name: "Иван", Password: "secret1",
	}); err != nil {
		t.Fatalf("SendCode failed: %v", err)
	}
	rec := vers.records[verKey("new@example.com", models.VerificationPurposeRegister)]
	if rec == nil || rec.UserID != "" {
		t.Fatalf("registration record must not be bound to a user, got %+v", rec)
	}
}

func TestVerifyCodeRejectsChangeEmailPurpose(t *testing.T) {
	svc, _, vers := newAuthService()
	rec := &models.VerificationRecord{
		Email: "a@b.c", Purpose: models.VerificationPurposeChangeEmail, UserID: "u1",
		CodeHash: hash(t, "123456"), ExpiresAt: time.Now().Add(5 * time.Minute),
	}
	vers.records[verKey("a@b.c", models.VerificationPurposeChangeEmail)] = rec

	_, err := svc.VerifyCode(context.Background(), models.VerifyCodeRequest{
		Email: "a@b.c", Code: "000000", Purpose: models.VerificationPurposeChangeEmail,
	})
	if err != ErrInvalidPurpose {
		t.Fatalf("expected ErrInvalidPurpose, got %v", err)
	}
	if rec.Attempts != 0 {
		t.Fatal("email-change codes must not be touched by the registration flow")
	}
}

func TestVerifyCodeAttemptsAlreadyExhausted(t *testing.T) {
	svc, _, vers := newAuthService()
	vers.records[verKey("a@b.c", models.VerificationPurposeRegister)] = &models.VerificationRecord{
		Email: "a@b.c", Purpose: models.VerificationPurposeRegister, Attempts: maxCodeAttempts,
		CodeHash: hash(t, "123456"), ExpiresAt: time.Now().Add(5 * time.Minute), TokenHash: hashRequestToken(testRegToken),
	}

	_, err := svc.VerifyCode(context.Background(), models.VerifyCodeRequest{
		Email: "a@b.c", Code: "123456", Purpose: models.VerificationPurposeRegister, Token: testRegToken,
	})
	if err != ErrTooManyAttempts {
		t.Fatalf("expected ErrTooManyAttempts, got %v", err)
	}
}

func TestVerifyCodeRegisterRaceReturnsAlreadyExists(t *testing.T) {
	svc, users, vers := newAuthService()
	vers.records[verKey("new@example.com", models.VerificationPurposeRegister)] = &models.VerificationRecord{
		Email: "new@example.com", Purpose: models.VerificationPurposeRegister, Name: "X",
		CodeHash: hash(t, "123456"), PasswordHash: hash(t, "secret1"), ExpiresAt: time.Now().Add(5 * time.Minute), TokenHash: hashRequestToken(testRegToken),
	}
	req := models.VerifyCodeRequest{Email: "new@example.com", Code: "123456", Purpose: models.VerificationPurposeRegister, Token: testRegToken}

	users.insertErr = duplicateKeyError()
	if _, err := svc.VerifyCode(context.Background(), req); err != ErrUserAlreadyExists {
		t.Fatalf("expected ErrUserAlreadyExists on duplicate key, got %v", err)
	}

	boom := errors.New("db down")
	users.insertErr = boom
	if _, err := svc.VerifyCode(context.Background(), req); !errors.Is(err, boom) {
		t.Fatalf("expected insert error, got %v", err)
	}

	users.insertErr = nil
	users.byEmail["new@example.com"] = &models.User{ID: "u9", Email: "new@example.com"}
	if _, err := svc.VerifyCode(context.Background(), req); err != ErrUserAlreadyExists {
		t.Fatalf("expected ErrUserAlreadyExists for a registered email, got %v", err)
	}
}

func TestAuthServiceRepositoryErrors(t *testing.T) {
	boom := errors.New("db down")
	ctx := context.Background()
	register := models.SendCodeRequest{
		Email: "new@example.com", Purpose: models.VerificationPurposeRegister, Name: "X", Password: "secret1",
	}

	svc, users, vers := newAuthService()
	users.findByEmailErr = boom
	if _, err := svc.SendCode(ctx, register); !errors.Is(err, boom) {
		t.Fatalf("SendCode: expected FindByEmail error, got %v", err)
	}
	if _, err := svc.Login(ctx, models.LoginRequest{Email: "a@b.c", Password: "x"}); !errors.Is(err, boom) {
		t.Fatalf("Login: expected FindByEmail error, got %v", err)
	}
	users.findByEmailErr = nil

	vers.findErr = boom
	if _, err := svc.SendCode(ctx, register); !errors.Is(err, boom) {
		t.Fatalf("SendCode: expected FindValid error, got %v", err)
	}
	if _, err := svc.VerifyCode(ctx, models.VerifyCodeRequest{
		Email: "new@example.com", Code: "123456", Purpose: models.VerificationPurposeRegister, Token: testRegToken,
	}); !errors.Is(err, boom) {
		t.Fatalf("VerifyCode: expected FindValid error, got %v", err)
	}
	vers.findErr = nil

	vers.upsertErr = boom
	if _, err := svc.SendCode(ctx, register); !errors.Is(err, boom) {
		t.Fatalf("SendCode: expected Upsert error, got %v", err)
	}
}

func TestGetByID(t *testing.T) {
	svc, users, _ := newAuthService()
	seedUser(users, "u1", "U", "u1@example.com")

	got, err := svc.GetByID(context.Background(), "u1")
	if err != nil || got.ID != "u1" || got.Email != "u1@example.com" {
		t.Fatalf("unexpected result %+v (%v)", got, err)
	}
	if _, err := svc.GetByID(context.Background(), "ghost"); err != ErrUserNotFound {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}

	boom := errors.New("db down")
	users.findByIDErr = boom
	if _, err := svc.GetByID(context.Background(), "u1"); !errors.Is(err, boom) {
		t.Fatalf("expected repository error, got %v", err)
	}
}
