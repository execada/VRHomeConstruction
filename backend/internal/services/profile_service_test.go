package services

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"golang.org/x/crypto/bcrypt"
)

const (
	changeEmail  = models.VerificationPurposeChangeEmail
	testPassword = "secret123"
)

var (
	testHashOnce sync.Once
	testHash     string
)

// testPasswordHash — настоящий bcrypt-хэш testPassword (минимальная стоимость — быстро).
func testPasswordHash() string {
	testHashOnce.Do(func() {
		h, err := bcrypt.GenerateFromPassword([]byte(testPassword), bcrypt.MinCost)
		if err != nil {
			panic(err)
		}
		testHash = string(h)
	})
	return testHash
}

func seedUser(users *fakeUserRepo, id, name, email string) *models.User {
	u := &models.User{ID: id, Name: name, Email: email, PasswordHash: testPasswordHash()}
	users.byID[id] = u
	users.byEmail[email] = u
	return u
}

func storeChangeEmailCode(t *testing.T, vers *fakeVerificationRepo, userID, email, code string) *models.VerificationRecord {
	t.Helper()
	rec := &models.VerificationRecord{
		ID:         "ver-1",
		Email:      email,
		Purpose:    changeEmail,
		UserID:     userID,
		CodeHash:   hash(t, code),
		ExpiresAt:  time.Now().Add(5 * time.Minute),
		LastSentAt: time.Now(),
	}
	vers.records[verKey(email, changeEmail)] = rec
	return rec
}

func TestUpdateProfileChangesName(t *testing.T) {
	svc, users, _ := newAuthService()
	seedUser(users, "u1", "Old", "u1@example.com")

	got, err := svc.UpdateProfile(context.Background(), "u1", models.UpdateProfileRequest{Name: "  Пётр  "})
	if err != nil {
		t.Fatalf("UpdateProfile failed: %v", err)
	}
	if got.ID != "u1" || got.Name != "Пётр" || got.Email != "u1@example.com" {
		t.Fatalf("unexpected public user %+v", got)
	}
	if users.byID["u1"].Name != "Пётр" {
		t.Fatal("expected the new name to be persisted")
	}
}

func TestUpdateProfileValidation(t *testing.T) {
	for _, name := range []string{"", "   ", strings.Repeat("я", maxUserNameLen+1)} {
		svc, users, _ := newAuthService()
		seedUser(users, "u1", "Old", "u1@example.com")

		_, err := svc.UpdateProfile(context.Background(), "u1", models.UpdateProfileRequest{Name: name})
		assertValidationErr(t, err, ErrInvalidName)
		if users.byID["u1"].Name != "Old" {
			t.Fatal("invalid name must not be persisted")
		}
	}
}

func TestUpdateProfileUnknownUserAndErrors(t *testing.T) {
	svc, users, _ := newAuthService()
	if _, err := svc.UpdateProfile(context.Background(), "ghost", models.UpdateProfileRequest{Name: "X"}); err != ErrUserNotFound {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}

	boom := errors.New("db down")
	users.updateErr = boom
	seedUser(users, "u1", "Old", "u1@example.com")
	if _, err := svc.UpdateProfile(context.Background(), "u1", models.UpdateProfileRequest{Name: "X"}); !errors.Is(err, boom) {
		t.Fatalf("expected repository error, got %v", err)
	}
}

func TestSendEmailChangeCodeStoresRecordForUser(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")

	resp, err := svc.SendEmailChangeCode(context.Background(), "u1", models.EmailChangeCodeRequest{NewEmail: "  New@Example.com ", Password: testPassword})
	if err != nil {
		t.Fatalf("SendEmailChangeCode failed: %v", err)
	}
	if resp == nil || resp.Message == "" {
		t.Fatal("expected a non-empty response message")
	}

	rec := vers.records[verKey("new@example.com", changeEmail)]
	if rec == nil {
		t.Fatal("expected a change_email verification record for the new address")
	}
	if rec.UserID != "u1" || rec.CodeHash == "" || rec.PasswordHash != "" || rec.Name != "" {
		t.Fatalf("unexpected record %+v", rec)
	}
	if !rec.ExpiresAt.After(time.Now()) || rec.LastSentAt.IsZero() {
		t.Fatalf("expected fresh expiry/lastSentAt, got %+v", rec)
	}
	if users.byID["u1"].Email != "old@example.com" {
		t.Fatal("email must not change before the code is verified")
	}
}

func TestSendEmailChangeCodeRealMailerMessage(t *testing.T) {
	users := newFakeUserRepo()
	vers := newFakeVerificationRepo()
	svc := NewAuthService(users, vers, auth.NewTokenService("test-secret", time.Hour), &fakeSender{logOnly: false})
	seedUser(users, "u1", "U", "old@example.com")

	resp, err := svc.SendEmailChangeCode(context.Background(), "u1", models.EmailChangeCodeRequest{NewEmail: "new@example.com", Password: testPassword})
	if err != nil {
		t.Fatalf("SendEmailChangeCode failed: %v", err)
	}
	if !strings.Contains(resp.Message, "отправлен") {
		t.Fatalf("expected the 'code sent' message, got %q", resp.Message)
	}
}

func TestSendEmailChangeCodeRejectsTakenEmail(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	seedUser(users, "u2", "Other", "taken@example.com")

	for _, email := range []string{"taken@example.com", " OLD@example.com "} {
		if _, err := svc.SendEmailChangeCode(context.Background(), "u1", models.EmailChangeCodeRequest{NewEmail: email, Password: testPassword}); err != ErrUserAlreadyExists {
			t.Fatalf("%q: expected ErrUserAlreadyExists, got %v", email, err)
		}
	}
	if len(vers.records) != 0 {
		t.Fatal("no code must be issued for a taken email")
	}
}

func TestSendEmailChangeCodeValidatesEmail(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")

	for _, email := range []string{"", "not-an-email", "a@b", "user@example.com>"} {
		_, err := svc.SendEmailChangeCode(context.Background(), "u1", models.EmailChangeCodeRequest{NewEmail: email, Password: testPassword})
		assertValidationErr(t, err, ErrInvalidEmail)
	}
	if len(vers.records) != 0 {
		t.Fatal("no code must be issued for an invalid email")
	}
}

func TestSendEmailChangeCodeCooldown(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	req := models.EmailChangeCodeRequest{NewEmail: "new@example.com", Password: testPassword}

	if _, err := svc.SendEmailChangeCode(context.Background(), "u1", req); err != nil {
		t.Fatalf("first send failed: %v", err)
	}
	if _, err := svc.SendEmailChangeCode(context.Background(), "u1", req); err != ErrCodeResendTooSoon {
		t.Fatalf("expected ErrCodeResendTooSoon, got %v", err)
	}

	// После кулдауна код можно запросить снова.
	vers.records[verKey("new@example.com", changeEmail)].LastSentAt = time.Now().Add(-resendCooldown - time.Second)
	if _, err := svc.SendEmailChangeCode(context.Background(), "u1", req); err != nil {
		t.Fatalf("send after cooldown failed: %v", err)
	}
}

func TestSendEmailChangeCodeUnknownUserAndErrors(t *testing.T) {
	svc, users, vers := newAuthService()
	req := models.EmailChangeCodeRequest{NewEmail: "new@example.com", Password: testPassword}

	if _, err := svc.SendEmailChangeCode(context.Background(), "ghost", req); err != ErrUserNotFound {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}

	boom := errors.New("db down")
	seedUser(users, "u1", "U", "old@example.com")

	users.findByEmailErr = boom
	if _, err := svc.SendEmailChangeCode(context.Background(), "u1", req); !errors.Is(err, boom) {
		t.Fatalf("expected FindByEmail error, got %v", err)
	}
	users.findByEmailErr = nil

	vers.findErr = boom
	if _, err := svc.SendEmailChangeCode(context.Background(), "u1", req); !errors.Is(err, boom) {
		t.Fatalf("expected FindValid error, got %v", err)
	}
	vers.findErr = nil

	vers.upsertErr = boom
	if _, err := svc.SendEmailChangeCode(context.Background(), "u1", req); !errors.Is(err, boom) {
		t.Fatalf("expected Upsert error, got %v", err)
	}
	vers.upsertErr = nil

	users.findByIDErr = boom
	if _, err := svc.SendEmailChangeCode(context.Background(), "u1", req); !errors.Is(err, boom) {
		t.Fatalf("expected FindByID error, got %v", err)
	}
}

func TestVerifyEmailChangeUpdatesEmail(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	storeChangeEmailCode(t, vers, "u1", "new@example.com", "123456")

	resp, err := svc.VerifyEmailChange(context.Background(), "u1", models.EmailChangeVerifyRequest{
		NewEmail: " NEW@example.com ", Code: " 123456 ",
	})
	if err != nil {
		t.Fatalf("VerifyEmailChange failed: %v", err)
	}
	if resp.User.ID != "u1" || resp.User.Email != "new@example.com" || resp.User.Name != "U" {
		t.Fatalf("unexpected user in response %+v", resp.User)
	}
	if users.byID["u1"].Email != "new@example.com" || users.byEmail["new@example.com"] == nil || users.byEmail["old@example.com"] != nil {
		t.Fatal("expected the email to be updated in the repository")
	}
	if vers.records[verKey("new@example.com", changeEmail)] != nil {
		t.Fatal("expected the verification record to be deleted")
	}
}

func TestVerifyEmailChangeWrongCode(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	rec := storeChangeEmailCode(t, vers, "u1", "new@example.com", "123456")

	_, err := svc.VerifyEmailChange(context.Background(), "u1", models.EmailChangeVerifyRequest{NewEmail: "new@example.com", Code: "000000"})
	if err != ErrInvalidCode {
		t.Fatalf("expected ErrInvalidCode, got %v", err)
	}
	if rec.Attempts != 1 || users.byID["u1"].Email != "old@example.com" {
		t.Fatal("expected a failed attempt to be counted and the email to stay unchanged")
	}
}

func TestVerifyEmailChangeTooManyAttempts(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	storeChangeEmailCode(t, vers, "u1", "new@example.com", "123456")
	req := models.EmailChangeVerifyRequest{NewEmail: "new@example.com", Code: "000000"}

	for i := 0; i < maxCodeAttempts-1; i++ {
		if _, err := svc.VerifyEmailChange(context.Background(), "u1", req); err != ErrInvalidCode {
			t.Fatalf("attempt %d: expected ErrInvalidCode, got %v", i+1, err)
		}
	}
	if _, err := svc.VerifyEmailChange(context.Background(), "u1", req); err != ErrTooManyAttempts {
		t.Fatalf("expected ErrTooManyAttempts, got %v", err)
	}

	// Даже верный код после исчерпания попыток не принимается; запись не удаляется,
	// чтобы пауза перед новой отправкой продолжала действовать.
	req.Code = "123456"
	if _, err := svc.VerifyEmailChange(context.Background(), "u1", req); err != ErrTooManyAttempts {
		t.Fatalf("expected ErrTooManyAttempts after exhaustion, got %v", err)
	}
	if users.byID["u1"].Email != "old@example.com" || vers.records[verKey("new@example.com", changeEmail)] == nil {
		t.Fatal("email must stay unchanged and the exhausted record must be kept")
	}
}

func TestVerifyEmailChangeAttemptsAlreadyExhausted(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	rec := storeChangeEmailCode(t, vers, "u1", "new@example.com", "123456")
	rec.Attempts = maxCodeAttempts

	_, err := svc.VerifyEmailChange(context.Background(), "u1", models.EmailChangeVerifyRequest{NewEmail: "new@example.com", Code: "123456"})
	if err != ErrTooManyAttempts {
		t.Fatalf("expected ErrTooManyAttempts, got %v", err)
	}
	if vers.records[verKey("new@example.com", changeEmail)] == nil {
		t.Fatal("exhausted code must be kept until it expires (resend cooldown keeps working)")
	}
}

func TestVerifyEmailChangeExpired(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	rec := storeChangeEmailCode(t, vers, "u1", "new@example.com", "123456")
	rec.ExpiresAt = time.Now().Add(-time.Minute)

	_, err := svc.VerifyEmailChange(context.Background(), "u1", models.EmailChangeVerifyRequest{NewEmail: "new@example.com", Code: "123456"})
	if err != ErrCodeExpired {
		t.Fatalf("expected ErrCodeExpired, got %v", err)
	}
}

func TestVerifyEmailChangeRejectsOtherUsersCode(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	seedUser(users, "u2", "Other", "other@example.com")
	rec := storeChangeEmailCode(t, vers, "u2", "new@example.com", "123456")

	_, err := svc.VerifyEmailChange(context.Background(), "u1", models.EmailChangeVerifyRequest{NewEmail: "new@example.com", Code: "123456"})
	if err != ErrCodeExpired {
		t.Fatalf("expected ErrCodeExpired for a code requested by another user, got %v", err)
	}
	if rec.Attempts != 0 || vers.records[verKey("new@example.com", changeEmail)] == nil {
		t.Fatal("another user's code must stay untouched")
	}
	if users.byID["u1"].Email != "old@example.com" || users.byID["u2"].Email != "other@example.com" {
		t.Fatal("no email must change")
	}
}

func TestVerifyEmailChangeEmailTakenMeanwhile(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	storeChangeEmailCode(t, vers, "u1", "new@example.com", "123456")
	seedUser(users, "u2", "Fast", "new@example.com") // адрес заняли после отправки кода

	_, err := svc.VerifyEmailChange(context.Background(), "u1", models.EmailChangeVerifyRequest{NewEmail: "new@example.com", Code: "123456"})
	if err != ErrUserAlreadyExists {
		t.Fatalf("expected ErrUserAlreadyExists, got %v", err)
	}
	if users.byID["u1"].Email != "old@example.com" {
		t.Fatal("email must stay unchanged")
	}
}

func TestVerifyEmailChangeDuplicateKeyRace(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	storeChangeEmailCode(t, vers, "u1", "new@example.com", "123456")
	users.updateEmailErr = duplicateKeyError()

	_, err := svc.VerifyEmailChange(context.Background(), "u1", models.EmailChangeVerifyRequest{NewEmail: "new@example.com", Code: "123456"})
	if err != ErrUserAlreadyExists {
		t.Fatalf("expected ErrUserAlreadyExists on duplicate key, got %v", err)
	}
}

func TestVerifyEmailChangeUnknownUserAndErrors(t *testing.T) {
	svc, users, vers := newAuthService()
	storeChangeEmailCode(t, vers, "ghost", "new@example.com", "123456")
	req := models.EmailChangeVerifyRequest{NewEmail: "new@example.com", Code: "123456"}

	if _, err := svc.VerifyEmailChange(context.Background(), "ghost", req); err != ErrUserNotFound {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}

	_, err := svc.VerifyEmailChange(context.Background(), "u1", models.EmailChangeVerifyRequest{NewEmail: "bad", Code: "123456"})
	assertValidationErr(t, err, ErrInvalidEmail)

	boom := errors.New("db down")
	seedUser(users, "u1", "U", "old@example.com")
	storeChangeEmailCode(t, vers, "u1", "new@example.com", "123456")

	users.updateEmailErr = boom
	if _, err := svc.VerifyEmailChange(context.Background(), "u1", req); !errors.Is(err, boom) {
		t.Fatalf("expected UpdateEmail error, got %v", err)
	}
	users.updateEmailErr = nil

	users.findByEmailErr = boom
	if _, err := svc.VerifyEmailChange(context.Background(), "u1", req); !errors.Is(err, boom) {
		t.Fatalf("expected FindByEmail error, got %v", err)
	}
	users.findByEmailErr = nil

	vers.consumeErr = boom
	if _, err := svc.VerifyEmailChange(context.Background(), "u1", req); !errors.Is(err, boom) {
		t.Fatalf("expected ConsumeAttempt error, got %v", err)
	}
}

func TestVerifyEmailChangeSucceedsEvenIfRecordCleanupFails(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	storeChangeEmailCode(t, vers, "u1", "new@example.com", "123456")
	vers.deleteErr = errors.New("db hiccup")

	resp, err := svc.VerifyEmailChange(context.Background(), "u1", models.EmailChangeVerifyRequest{NewEmail: "new@example.com", Code: "123456"})
	if err != nil || resp.User.Email != "new@example.com" {
		t.Fatalf("email change must succeed even if the code cleanup fails, got %v", err)
	}
}

// Сбой хранилища при расходе попытки — внутренняя ошибка, а не «неверный код»:
// без учёта попытки сравнивать код нельзя (иначе лимит попыток обходится).
func TestVerifyEmailChangeAttemptCounterFailure(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")
	storeChangeEmailCode(t, vers, "u1", "new@example.com", "123456")
	boom := errors.New("db hiccup")
	vers.consumeErr = boom

	_, err := svc.VerifyEmailChange(context.Background(), "u1", models.EmailChangeVerifyRequest{NewEmail: "new@example.com", Code: "123456"})
	if !errors.Is(err, boom) {
		t.Fatalf("expected the storage error, got %v", err)
	}
	if users.byID["u1"].Email != "old@example.com" {
		t.Fatal("email must not change when the attempt could not be recorded")
	}
}

func TestSendEmailChangeCodeRequiresCurrentPassword(t *testing.T) {
	svc, users, vers := newAuthService()
	seedUser(users, "u1", "U", "old@example.com")

	req := models.EmailChangeCodeRequest{NewEmail: "new@example.com", Password: "wrong-password"}
	if _, err := svc.SendEmailChangeCode(context.Background(), "u1", req); err != ErrWrongPassword {
		t.Fatalf("expected ErrWrongPassword, got %v", err)
	}
	if len(vers.records) != 0 {
		t.Fatal("no code must be issued without the current password")
	}

	// Перебор пароля через смену почты ограничен так же, как вход.
	for i := 1; i < maxLoginFailures; i++ {
		_, _ = svc.SendEmailChangeCode(context.Background(), "u1", req)
	}
	ok := models.EmailChangeCodeRequest{NewEmail: "new@example.com", Password: testPassword}
	if _, err := svc.SendEmailChangeCode(context.Background(), "u1", ok); err != ErrTooManyLoginAttempts {
		t.Fatalf("expected ErrTooManyLoginAttempts after %d failures, got %v", maxLoginFailures, err)
	}
}
