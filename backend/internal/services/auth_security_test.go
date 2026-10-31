package services

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

const registerPurpose = models.VerificationPurposeRegister

// registerRecord — живая заявка на регистрацию с кодом code, привязанная к testRegToken.
func registerRecord(t *testing.T, email, code string) *models.VerificationRecord {
	t.Helper()
	return &models.VerificationRecord{
		ID:           primitive.NewObjectID().Hex(),
		Email:        email,
		Purpose:      registerPurpose,
		CodeHash:     hash(t, code),
		Name:         "Иван",
		PasswordHash: hash(t, "secret1"),
		TokenHash:    hashRequestToken(testRegToken),
		ExpiresAt:    time.Now().Add(5 * time.Minute),
	}
}

func TestSendCodeReturnsTokenBoundToRecord(t *testing.T) {
	svc, _, vers := newAuthService()

	resp, err := svc.SendCode(context.Background(), models.SendCodeRequest{
		Email: "new@example.com", Purpose: registerPurpose, Name: "Иван", Password: "secret1",
	})
	if err != nil {
		t.Fatalf("SendCode failed: %v", err)
	}
	if len(resp.Token) != 64 {
		t.Fatalf("expected a 32-byte hex token, got %q", resp.Token)
	}
	rec := vers.records[verKey("new@example.com", registerPurpose)]
	if rec.TokenHash != hashRequestToken(resp.Token) {
		t.Fatal("the record must store the hash of the issued token")
	}
	if rec.TokenHash == resp.Token {
		t.Fatal("the raw token must never be stored")
	}
}

func TestVerifyCodeRequiresRegistrationToken(t *testing.T) {
	svc, users, vers := newAuthService()
	key := verKey("new@example.com", registerPurpose)
	vers.records[key] = registerRecord(t, "new@example.com", "123456")
	ctx := context.Background()

	// Чужой токен — как будто кода нет, и попытка владельца заявки не тратится.
	foreign := models.VerifyCodeRequest{Email: "new@example.com", Code: "123456", Purpose: registerPurpose, Token: "someone-else"}
	if _, err := svc.VerifyCode(ctx, foreign); err != ErrCodeExpired {
		t.Fatalf("expected ErrCodeExpired for a foreign token, got %v", err)
	}
	if vers.records[key].Attempts != 0 || len(users.byID) != 0 {
		t.Fatal("a foreign token must neither burn attempts nor create a user")
	}

	own := models.VerifyCodeRequest{Email: "new@example.com", Code: "123456", Purpose: registerPurpose, Token: " " + testRegToken + " "}
	if _, err := svc.VerifyCode(ctx, own); err != nil {
		t.Fatalf("the requester's own token must work, got %v", err)
	}
}

// Перезапись незавершённой заявки (новый пароль) отвязывает старый токен:
// код из письма не создаст аккаунт с чужим паролем.
func TestResendRebindsRegistrationToNewToken(t *testing.T) {
	svc, _, vers := newAuthService()
	ctx := context.Background()
	req := models.SendCodeRequest{Email: "new@example.com", Purpose: registerPurpose, Name: "Иван", Password: "secret1"}

	first, err := svc.SendCode(ctx, req)
	if err != nil {
		t.Fatalf("first SendCode failed: %v", err)
	}
	key := verKey("new@example.com", registerPurpose)
	vers.records[key].LastSentAt = time.Now().Add(-time.Minute) // пауза прошла

	second, err := svc.SendCode(ctx, req)
	if err != nil {
		t.Fatalf("second SendCode failed: %v", err)
	}
	if first.Token == second.Token {
		t.Fatal("each request must get its own token")
	}
	vers.records[key].CodeHash = hash(t, "123456")

	stale := models.VerifyCodeRequest{Email: "new@example.com", Code: "123456", Purpose: registerPurpose, Token: first.Token}
	if _, err := svc.VerifyCode(ctx, stale); err != ErrCodeExpired {
		t.Fatalf("the replaced token must stop working, got %v", err)
	}
}

// Параллельные подборы не получают больше maxCodeAttempts сравнений кода.
func TestVerifyCodeConcurrentGuessesAreCapped(t *testing.T) {
	svc, _, vers := newAuthService()
	key := verKey("new@example.com", registerPurpose)
	vers.records[key] = registerRecord(t, "new@example.com", "123456")

	const callers = 20
	results := make(chan error, callers)
	var wg sync.WaitGroup
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := svc.VerifyCode(context.Background(), models.VerifyCodeRequest{
				Email: "new@example.com", Code: "000000", Purpose: registerPurpose, Token: testRegToken,
			})
			results <- err
		}()
	}
	wg.Wait()
	close(results)

	counts := map[error]int{}
	for err := range results {
		counts[err]++
	}
	if counts[ErrInvalidCode] != maxCodeAttempts-1 || counts[ErrTooManyAttempts] != callers-maxCodeAttempts+1 {
		t.Fatalf("unexpected outcome distribution: %v", counts)
	}
	if got := vers.records[key].Attempts; got != maxCodeAttempts {
		t.Fatalf("expected exactly %d consumed attempts, got %d", maxCodeAttempts, got)
	}
}

func TestValidateRegistration(t *testing.T) {
	cases := []struct {
		name       string
		req        models.SendCodeRequest
		want       error
		validation bool
		wantName   string
	}{
		{name: "trims name", req: models.SendCodeRequest{Name: "  Иван  ", Password: "secret1"}, wantName: "Иван"},
		{name: "empty name", req: models.SendCodeRequest{Password: "secret1"}, want: ErrNameRequired},
		{name: "blank name", req: models.SendCodeRequest{Name: " \t ", Password: "secret1"}, want: ErrNameRequired},
		{name: "too long name", req: models.SendCodeRequest{Name: strings.Repeat("я", maxUserNameLen+1), Password: "secret1"}, validation: true},
		{name: "short password", req: models.SendCodeRequest{Name: "X", Password: "12345"}, want: ErrPasswordTooShort},
		{name: "length counts runes", req: models.SendCodeRequest{Name: "X", Password: "пароль"}, wantName: "X"},
		{name: "72 bytes is fine", req: models.SendCodeRequest{Name: "X", Password: strings.Repeat("a", maxPasswordBytes)}, wantName: "X"},
		{name: "over 72 bytes", req: models.SendCodeRequest{Name: "X", Password: strings.Repeat("a", maxPasswordBytes+1)}, want: ErrPasswordTooLong},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			name, err := validateRegistration(tc.req)
			switch {
			case tc.validation:
				if !IsValidationError(err) {
					t.Fatalf("expected a validation error, got %v", err)
				}
			case err != tc.want:
				t.Fatalf("expected %v, got %v", tc.want, err)
			case err == nil && name != tc.wantName:
				t.Fatalf("expected name %q, got %q", tc.wantName, name)
			}
		})
	}
}

func seedLoginUser(t *testing.T, users *fakeUserRepo) {
	t.Helper()
	users.byEmail["u@example.com"] = &models.User{
		ID: "u1", Email: "u@example.com", Name: "U", PasswordHash: hash(t, "correct-password"),
	}
}

func TestLoginLocksOutAfterRepeatedFailures(t *testing.T) {
	svc, users, _ := newAuthService()
	seedLoginUser(t, users)
	ctx := context.Background()

	wrong := models.LoginRequest{Email: "u@example.com", Password: "wrong-password"}
	for i := 0; i < maxLoginFailures; i++ {
		if _, err := svc.Login(ctx, wrong); err != ErrInvalidCredentials {
			t.Fatalf("attempt %d: expected ErrInvalidCredentials, got %v", i+1, err)
		}
	}
	// Блокировка действует и на верный пароль, и на другое написание адреса.
	right := models.LoginRequest{Email: " U@Example.COM ", Password: "correct-password"}
	if _, err := svc.Login(ctx, right); err != ErrTooManyLoginAttempts {
		t.Fatalf("expected ErrTooManyLoginAttempts, got %v", err)
	}
}

func TestLoginSuccessResetsFailureCounter(t *testing.T) {
	svc, users, _ := newAuthService()
	seedLoginUser(t, users)
	ctx := context.Background()
	wrong := models.LoginRequest{Email: "u@example.com", Password: "wrong-password"}
	right := models.LoginRequest{Email: "u@example.com", Password: "correct-password"}

	for round := 0; round < 2; round++ {
		for i := 0; i < maxLoginFailures-1; i++ {
			_, _ = svc.Login(ctx, wrong)
		}
		if _, err := svc.Login(ctx, right); err != nil {
			t.Fatalf("round %d: a successful login must reset the counter, got %v", round+1, err)
		}
	}
}

func TestLoginUnknownAddressIsLimitedToo(t *testing.T) {
	svc, _, _ := newAuthService()
	ghost := models.LoginRequest{Email: "ghost@example.com", Password: "whatever"}
	for i := 0; i < maxLoginFailures; i++ {
		if _, err := svc.Login(context.Background(), ghost); err != ErrInvalidCredentials {
			t.Fatalf("attempt %d: expected ErrInvalidCredentials, got %v", i+1, err)
		}
	}
	if _, err := svc.Login(context.Background(), ghost); err != ErrTooManyLoginAttempts {
		t.Fatalf("expected ErrTooManyLoginAttempts, got %v", err)
	}
}

func TestFailureGuardWindow(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	g := newFailureGuard(2, time.Minute)
	g.now = func() time.Time { return now }

	g.Fail("k")
	if !g.Allow("k") {
		t.Fatal("one failure must still allow attempts")
	}
	g.Fail("k")
	if g.Allow("k") || !g.Allow("other") {
		t.Fatal("only the failing key must be blocked")
	}

	now = now.Add(time.Minute + time.Second)
	if !g.Allow("k") {
		t.Fatal("the block must lift after the window")
	}
	g.Fail("k")
	if !g.Allow("k") {
		t.Fatal("a new window starts counting from one failure")
	}
	g.Reset("k")
	if _, ok := g.entries["k"]; ok {
		t.Fatal("Reset must drop the entry")
	}
}

func TestFailureGuardSweepsExpiredEntries(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	g := newFailureGuard(3, time.Minute)
	g.now = func() time.Time { return now }

	g.Fail("old")
	now = now.Add(2 * time.Minute)
	g.Fail("new")
	if _, ok := g.entries["old"]; ok || len(g.entries) != 1 {
		t.Fatalf("expired entries must be swept, got %v", g.entries)
	}
}

func TestHashRequestToken(t *testing.T) {
	h := hashRequestToken("token")
	if len(h) != 64 || h == "token" {
		t.Fatalf("expected a hex SHA-256 digest, got %q", h)
	}
	if hashRequestToken(" token\n") != h || hashRequestToken("other") == h {
		t.Fatal("hash must be stable for the same (trimmed) token and differ otherwise")
	}
}

// scriptedSender считает вызовы и ведёт себя по сценарию: ждёт release, затем
// паникует или возвращает err.
type scriptedSender struct {
	release chan struct{}
	panics  bool
	err     error
	calls   atomic.Int32
}

func (s *scriptedSender) SendVerificationCode(_, _, _ string) error {
	s.calls.Add(1)
	<-s.release
	if s.panics {
		panic("smtp exploded")
	}
	return s.err
}

func (s *scriptedSender) LogOnly() bool { return false }

func TestMailQueueDropsWhenFullAndWaits(t *testing.T) {
	sender := &scriptedSender{release: make(chan struct{})}
	q := newMailQueue(sender, 1)
	q.Send("a@example.com", "123456", purposeLabelRegister)
	q.Send("b@example.com", "654321", purposeLabelRegister) // слот занят — письмо отбрасывается

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := q.Wait(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Wait must give up at the deadline while a mail is in flight, got %v", err)
	}

	close(sender.release)
	if err := q.Wait(context.Background()); err != nil {
		t.Fatalf("Wait after release: %v", err)
	}
	if got := sender.calls.Load(); got != 1 {
		t.Fatalf("expected one send (the second is dropped), got %d", got)
	}
}

func TestMailQueueSurvivesSenderFailures(t *testing.T) {
	release := make(chan struct{})
	close(release)
	for name, sender := range map[string]*scriptedSender{
		"panic": {release: release, panics: true},
		"error": {release: release, err: errors.New("smtp down")},
	} {
		t.Run(name, func(t *testing.T) {
			q := newMailQueue(sender, 1)
			for i := 0; i < 2; i++ {
				q.Send("a@example.com", "123456", purposeLabelRegister)
				if err := q.Wait(context.Background()); err != nil {
					t.Fatalf("Wait: %v", err)
				}
			}
			// Слот освобождается и после сбоя — второе письмо тоже ушло.
			if got := sender.calls.Load(); got != 2 {
				t.Fatalf("expected 2 sends, got %d", got)
			}
		})
	}
}

func TestAuthServiceShutdownWithoutPendingMail(t *testing.T) {
	svc, _, _ := newAuthService()
	if err := svc.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
}
