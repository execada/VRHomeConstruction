package services

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"golang.org/x/crypto/bcrypt"
)

const (
	resetPurpose = models.VerificationPurposeResetPassword
	newPassword  = "new-password-1"
)

type sentMail struct{ to, code, label string }

// recordingSender запоминает отправленные письма (безопасен для фоновой отправки).
type recordingSender struct {
	mu      sync.Mutex
	sent    []sentMail
	logOnly bool
}

func (s *recordingSender) SendVerificationCode(to, code, label string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sent = append(s.sent, sentMail{to: to, code: code, label: label})
	return nil
}

func (s *recordingSender) LogOnly() bool { return s.logOnly }

func (s *recordingSender) mails() []sentMail {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.sent)
}

func newResetService(t *testing.T) (*AuthService, *fakeUserRepo, *fakeVerificationRepo, *recordingSender) {
	t.Helper()
	users := newFakeUserRepo()
	vers := newFakeVerificationRepo()
	sender := &recordingSender{}
	svc := NewAuthService(users, vers, auth.NewTokenService("test-secret", time.Hour), sender)
	return svc, users, vers, sender
}

// waitMail дожидается писем, которые сервис отправляет в фоне.
func waitMail(t *testing.T, svc *AuthService) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := svc.Shutdown(ctx); err != nil {
		t.Fatalf("waiting for mail: %v", err)
	}
}

// requestResetCode запрашивает код и возвращает его из «письма».
func requestResetCode(t *testing.T, svc *AuthService, sender *recordingSender, email string) string {
	t.Helper()
	if _, err := svc.SendPasswordResetCode(context.Background(), models.PasswordResetCodeRequest{Email: email}); err != nil {
		t.Fatalf("SendPasswordResetCode: %v", err)
	}
	waitMail(t, svc)
	mails := sender.mails()
	if len(mails) == 0 {
		t.Fatal("expected a reset code email")
	}
	return mails[len(mails)-1].code
}

func resetRequest(email, code, password string) models.PasswordResetRequest {
	return models.PasswordResetRequest{Email: email, Code: code, Password: password}
}

// wrongCode — заведомо неверный код (не совпадает с выданным).
func wrongCode(code string) string {
	if code == "000000" {
		return "111111"
	}
	return "000000"
}

func TestSendPasswordResetCodeMailsAccountOwner(t *testing.T) {
	svc, users, vers, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")

	resp, err := svc.SendPasswordResetCode(context.Background(), models.PasswordResetCodeRequest{Email: "  Anna@Example.com "})
	if err != nil {
		t.Fatalf("SendPasswordResetCode: %v", err)
	}
	if resp.Message != msgResetCodeSent || resp.Token != "" {
		t.Fatalf("expected the neutral message without a token, got %+v", resp)
	}
	waitMail(t, svc)

	mails := sender.mails()
	if len(mails) != 1 || mails[0].to != "anna@example.com" || mails[0].label != purposeLabelResetPassword || len(mails[0].code) != 6 {
		t.Fatalf("expected one reset email to the owner, got %+v", mails)
	}
	rec := vers.records[verKey("anna@example.com", resetPurpose)]
	if rec == nil || rec.UserID != "u1" || rec.CodeHash == mails[0].code {
		t.Fatalf("the record must be bound to the account and keep only the code hash, got %+v", rec)
	}
	if bcrypt.CompareHashAndPassword([]byte(rec.CodeHash), []byte(mails[0].code)) != nil {
		t.Fatal("the stored hash must match the mailed code")
	}
}

// Ответ не выдаёт, есть ли аккаунт: тот же текст, та же пауза перед повтором,
// запись кода тоже создаётся — только письмо никуда не уходит.
func TestSendPasswordResetCodeLooksTheSameForUnknownEmail(t *testing.T) {
	svc, users, vers, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	ctx := context.Background()

	known, err := svc.SendPasswordResetCode(ctx, models.PasswordResetCodeRequest{Email: "anna@example.com"})
	if err != nil {
		t.Fatalf("known: %v", err)
	}
	unknown, err := svc.SendPasswordResetCode(ctx, models.PasswordResetCodeRequest{Email: "ghost@example.com"})
	if err != nil {
		t.Fatalf("unknown: %v", err)
	}
	if !reflect.DeepEqual(known, unknown) {
		t.Fatalf("responses must be identical, got %+v vs %+v", known, unknown)
	}
	waitMail(t, svc)
	if mails := sender.mails(); len(mails) != 1 || mails[0].to != "anna@example.com" {
		t.Fatalf("only the account owner gets an email, got %+v", mails)
	}
	rec := vers.records[verKey("ghost@example.com", resetPurpose)]
	if rec == nil || rec.UserID != "" {
		t.Fatalf("an unknown address still gets a record without a user, got %+v", rec)
	}

	for _, email := range []string{"anna@example.com", "ghost@example.com"} {
		if _, err := svc.SendPasswordResetCode(ctx, models.PasswordResetCodeRequest{Email: email}); err != ErrCodeResendTooSoon {
			t.Fatalf("%s: expected the same cooldown, got %v", email, err)
		}
	}
}

func TestSendPasswordResetCodeMessageInLogOnlyMode(t *testing.T) {
	svc, _, _, sender := newResetService(t)
	sender.logOnly = true
	resp, err := svc.SendPasswordResetCode(context.Background(), models.PasswordResetCodeRequest{Email: "ghost@example.com"})
	if err != nil || resp.Message != msgResetCodeInLogs {
		t.Fatalf("expected the log-only hint, got %+v (%v)", resp, err)
	}
}

func TestSendPasswordResetCodeValidatesEmail(t *testing.T) {
	svc, _, vers, _ := newResetService(t)
	for _, email := range []string{"", "nope", "a@b", "Имя <a@example.com>"} {
		if _, err := svc.SendPasswordResetCode(context.Background(), models.PasswordResetCodeRequest{Email: email}); !IsValidationError(err) {
			t.Fatalf("%q: expected a validation error, got %v", email, err)
		}
	}
	if len(vers.records) != 0 {
		t.Fatal("invalid addresses must not create records")
	}
}

func TestResetPasswordChangesPasswordAndRevokesSessions(t *testing.T) {
	svc, users, vers, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	ctx := context.Background()

	before, err := svc.Login(ctx, models.LoginRequest{Email: "anna@example.com", Password: testPassword})
	if err != nil {
		t.Fatalf("login before reset: %v", err)
	}
	code := requestResetCode(t, svc, sender, "anna@example.com")

	resp, err := svc.ResetPassword(ctx, resetRequest(" ANNA@example.com ", " "+code+" ", newPassword))
	if err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}
	if resp.Message != msgPasswordChanged {
		t.Fatalf("unexpected message %q", resp.Message)
	}
	if _, ok := vers.records[verKey("anna@example.com", resetPurpose)]; ok {
		t.Fatal("a used code must be removed")
	}

	if _, err := svc.Login(ctx, models.LoginRequest{Email: "anna@example.com", Password: testPassword}); err != ErrInvalidCredentials {
		t.Fatalf("the old password must stop working, got %v", err)
	}
	after, err := svc.Login(ctx, models.LoginRequest{Email: "anna@example.com", Password: newPassword})
	if err != nil {
		t.Fatalf("login with the new password: %v", err)
	}

	tokens := auth.NewTokenService("test-secret", time.Hour)
	for name, tc := range map[string]struct {
		token  string
		active bool
	}{"token before reset": {before.Token, false}, "token after reset": {after.Token, true}} {
		claims, err := tokens.Parse(tc.token)
		if err != nil {
			t.Fatalf("%s: parse: %v", name, err)
		}
		active, err := svc.SessionActive(ctx, claims.UserID, claims.Version)
		if err != nil || active != tc.active {
			t.Fatalf("%s: expected active=%v, got %v (%v)", name, tc.active, active, err)
		}
	}
}

// Новый пароль проверяется по правилам регистрации до кода — попытка не тратится.
func TestResetPasswordValidatesNewPasswordFirst(t *testing.T) {
	svc, users, vers, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	code := requestResetCode(t, svc, sender, "anna@example.com")
	ctx := context.Background()

	for password, want := range map[string]error{
		"12345":                                 ErrPasswordTooShort,
		strings.Repeat("a", maxPasswordBytes+1): ErrPasswordTooLong,
	} {
		if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", code, password)); err != want {
			t.Fatalf("expected %v, got %v", want, err)
		}
	}
	if _, err := svc.ResetPassword(ctx, resetRequest("bad-address", code, newPassword)); !IsValidationError(err) {
		t.Fatalf("expected a validation error for the address, got %v", err)
	}
	if got := vers.records[verKey("anna@example.com", resetPurpose)].Attempts; got != 0 {
		t.Fatalf("validation errors must not spend attempts, got %d", got)
	}
	if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", code, "пароль")); err != nil {
		t.Fatalf("six letters are enough (runes, not bytes): %v", err)
	}
}

func TestResetPasswordLimitsAttemptsPerCode(t *testing.T) {
	svc, users, _, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	code := requestResetCode(t, svc, sender, "anna@example.com")
	ctx := context.Background()

	wrong := resetRequest("anna@example.com", wrongCode(code), newPassword)
	for i := 0; i < maxCodeAttempts-1; i++ {
		if _, err := svc.ResetPassword(ctx, wrong); err != ErrInvalidCode {
			t.Fatalf("attempt %d: expected ErrInvalidCode, got %v", i+1, err)
		}
	}
	if _, err := svc.ResetPassword(ctx, wrong); err != ErrTooManyAttempts {
		t.Fatalf("the last attempt must exhaust the code, got %v", err)
	}
	if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", code, newPassword)); err != ErrTooManyAttempts {
		t.Fatalf("an exhausted code must not work even when correct, got %v", err)
	}
	if bcrypt.CompareHashAndPassword([]byte(users.byID["u1"].PasswordHash), []byte(testPassword)) != nil {
		t.Fatal("the password must stay unchanged")
	}
}

func TestResetPasswordRejectsMissingOrExpiredCode(t *testing.T) {
	svc, users, vers, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	ctx := context.Background()

	if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", "123456", newPassword)); err != ErrCodeExpired {
		t.Fatalf("no code requested: expected ErrCodeExpired, got %v", err)
	}
	code := requestResetCode(t, svc, sender, "anna@example.com")
	vers.records[verKey("anna@example.com", resetPurpose)].ExpiresAt = time.Now().Add(-time.Second)
	if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", code, newPassword)); err != ErrCodeExpired {
		t.Fatalf("expired code: expected ErrCodeExpired, got %v", err)
	}
}

// Для адреса без аккаунта код никому не уходил: даже угаданный код ведёт себя как неверный.
func TestResetPasswordUnknownEmailBehavesLikeWrongCode(t *testing.T) {
	svc, users, vers, _ := newResetService(t)
	ctx := context.Background()
	if _, err := svc.SendPasswordResetCode(ctx, models.PasswordResetCodeRequest{Email: "ghost@example.com"}); err != nil {
		t.Fatalf("SendPasswordResetCode: %v", err)
	}
	vers.records[verKey("ghost@example.com", resetPurpose)].CodeHash = hash(t, "123456")

	for i := 0; i < maxCodeAttempts-1; i++ {
		if _, err := svc.ResetPassword(ctx, resetRequest("ghost@example.com", "123456", newPassword)); err != ErrInvalidCode {
			t.Fatalf("attempt %d: expected ErrInvalidCode, got %v", i+1, err)
		}
	}
	if _, err := svc.ResetPassword(ctx, resetRequest("ghost@example.com", "123456", newPassword)); err != ErrTooManyAttempts {
		t.Fatalf("expected ErrTooManyAttempts like for a real account, got %v", err)
	}
	if len(users.byID) != 0 {
		t.Fatal("no account may appear")
	}
}

func TestResetPasswordCodeIsSingleUse(t *testing.T) {
	svc, users, _, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	code := requestResetCode(t, svc, sender, "anna@example.com")
	ctx := context.Background()

	if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", code, newPassword)); err != nil {
		t.Fatalf("first use: %v", err)
	}
	if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", code, "another-password")); err != ErrCodeExpired {
		t.Fatalf("a used code must not work again, got %v", err)
	}
	if users.byID["u1"].TokenVersion != 1 {
		t.Fatalf("the password must change exactly once, version %d", users.byID["u1"].TokenVersion)
	}
}

// Из параллельных подтверждений одного кода срабатывает ровно одно.
func TestResetPasswordConcurrentUseSucceedsOnce(t *testing.T) {
	svc, users, _, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	code := requestResetCode(t, svc, sender, "anna@example.com")

	const callers = 4
	results := make(chan error, callers)
	var wg sync.WaitGroup
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := svc.ResetPassword(context.Background(), resetRequest("anna@example.com", code, newPassword))
			results <- err
		}()
	}
	wg.Wait()
	close(results)

	counts := map[error]int{}
	for err := range results {
		counts[err]++
	}
	if counts[nil] != 1 || counts[ErrCodeExpired] != callers-1 {
		t.Fatalf("expected one success, got %v", counts)
	}
	if v := users.byID["u1"].TokenVersion; v != 1 {
		t.Fatalf("expected a single password change, version %d", v)
	}
}

// Новые коды не дают обойти лимит: неверные коды по адресу считаются за окно,
// после maxResetFailures сброс закрыт даже с верным кодом, пока окно не пройдёт.
func TestResetPasswordLimitsGuessesAcrossCodes(t *testing.T) {
	svc, users, vers, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	now := time.Now()
	svc.resetFailures.now = func() time.Time { return now }
	ctx := context.Background()
	key := verKey("anna@example.com", resetPurpose)

	failures := 0
	for failures < maxResetFailures {
		code := requestResetCode(t, svc, sender, "anna@example.com")
		for i := 0; i < maxCodeAttempts && failures < maxResetFailures; i++ {
			_, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", wrongCode(code), newPassword))
			if err != ErrInvalidCode && err != ErrTooManyAttempts {
				t.Fatalf("failure %d: unexpected %v", failures+1, err)
			}
			failures++
		}
		vers.records[key].LastSentAt = time.Now().Add(-time.Minute) // пауза перед новым кодом прошла
	}

	code := requestResetCode(t, svc, sender, "anna@example.com")
	if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", code, newPassword)); err != ErrTooManyResetAttempts {
		t.Fatalf("expected ErrTooManyResetAttempts, got %v", err)
	}
	if vers.records[key].Attempts != 0 {
		t.Fatal("a blocked request must not spend the code's attempts")
	}

	now = now.Add(resetFailureWindow + time.Second)
	if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", code, newPassword)); err != nil {
		t.Fatalf("after the window the code must work, got %v", err)
	}
}

// Запросы без живого кода (истёк, не запрошен) — не попытки угадать: лимит они не тратят.
func TestResetPasswordMissingCodeDoesNotCountAsGuess(t *testing.T) {
	svc, users, _, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	ctx := context.Background()
	for i := 0; i < maxResetFailures+1; i++ {
		if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", "123456", newPassword)); err != ErrCodeExpired {
			t.Fatalf("expected ErrCodeExpired, got %v", err)
		}
	}
	code := requestResetCode(t, svc, sender, "anna@example.com")
	if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", code, newPassword)); err != nil {
		t.Fatalf("the reset must still be possible, got %v", err)
	}
}

// Забыл пароль → много неудачных входов → сброс: войти с новым паролем можно сразу.
func TestResetPasswordLiftsLoginLockout(t *testing.T) {
	svc, users, _, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	ctx := context.Background()
	for i := 0; i < maxLoginFailures; i++ {
		_, _ = svc.Login(ctx, models.LoginRequest{Email: "anna@example.com", Password: "forgotten"})
	}
	if _, err := svc.Login(ctx, models.LoginRequest{Email: "anna@example.com", Password: testPassword}); err != ErrTooManyLoginAttempts {
		t.Fatalf("precondition: expected a lockout, got %v", err)
	}

	code := requestResetCode(t, svc, sender, "anna@example.com")
	if _, err := svc.ResetPassword(ctx, resetRequest("anna@example.com", code, newPassword)); err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}
	if _, err := svc.Login(ctx, models.LoginRequest{Email: "anna@example.com", Password: newPassword}); err != nil {
		t.Fatalf("the new password must work right away, got %v", err)
	}
}

// Код уходил на прежнюю почту: после смены почты аккаунта он пароль уже не меняет.
func TestResetPasswordRequiresCurrentEmail(t *testing.T) {
	svc, users, _, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	code := requestResetCode(t, svc, sender, "anna@example.com")
	if _, err := users.UpdateEmail(context.Background(), "u1", "new@example.com"); err != nil {
		t.Fatalf("UpdateEmail: %v", err)
	}

	if _, err := svc.ResetPassword(context.Background(), resetRequest("anna@example.com", code, newPassword)); err != ErrCodeExpired {
		t.Fatalf("expected ErrCodeExpired, got %v", err)
	}
	if u := users.byID["u1"]; u.TokenVersion != 0 || bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(testPassword)) != nil {
		t.Fatal("the password must stay unchanged")
	}
}

func TestResetPasswordAccountDeletedMeanwhile(t *testing.T) {
	svc, users, _, sender := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com")
	code := requestResetCode(t, svc, sender, "anna@example.com")
	delete(users.byID, "u1")
	delete(users.byEmail, "anna@example.com")

	if _, err := svc.ResetPassword(context.Background(), resetRequest("anna@example.com", code, newPassword)); err != ErrCodeExpired {
		t.Fatalf("expected ErrCodeExpired, got %v", err)
	}
}

func TestPasswordResetRepositoryErrors(t *testing.T) {
	boom := errors.New("db down")
	ctx := context.Background()

	t.Run("send: user lookup", func(t *testing.T) {
		svc, users, _, _ := newResetService(t)
		users.findByEmailErr = boom
		if _, err := svc.SendPasswordResetCode(ctx, models.PasswordResetCodeRequest{Email: "a@example.com"}); !errors.Is(err, boom) {
			t.Fatalf("expected the repository error, got %v", err)
		}
	})
	t.Run("send: cooldown lookup and store", func(t *testing.T) {
		svc, _, vers, _ := newResetService(t)
		vers.findErr = boom
		if _, err := svc.SendPasswordResetCode(ctx, models.PasswordResetCodeRequest{Email: "a@example.com"}); !errors.Is(err, boom) {
			t.Fatalf("FindValid: expected the repository error, got %v", err)
		}
		vers.findErr, vers.upsertErr = nil, boom
		if _, err := svc.SendPasswordResetCode(ctx, models.PasswordResetCodeRequest{Email: "a@example.com"}); !errors.Is(err, boom) {
			t.Fatalf("Upsert: expected the repository error, got %v", err)
		}
	})
	t.Run("reset: attempt, claim, update", func(t *testing.T) {
		svc, users, vers, sender := newResetService(t)
		seedUser(users, "u1", "Анна", "anna@example.com")
		code := requestResetCode(t, svc, sender, "anna@example.com")
		req := resetRequest("anna@example.com", code, newPassword)

		vers.consumeErr = boom
		if _, err := svc.ResetPassword(ctx, req); !errors.Is(err, boom) {
			t.Fatalf("ConsumeAttempt: expected the repository error, got %v", err)
		}
		vers.consumeErr, vers.claimErr = nil, boom
		if _, err := svc.ResetPassword(ctx, req); !errors.Is(err, boom) {
			t.Fatalf("Claim: expected the repository error, got %v", err)
		}
		vers.claimErr, users.updateErr = nil, boom
		if _, err := svc.ResetPassword(ctx, req); !errors.Is(err, boom) {
			t.Fatalf("UpdatePassword: expected the repository error, got %v", err)
		}
	})
}

func TestSessionActive(t *testing.T) {
	svc, users, _, _ := newResetService(t)
	seedUser(users, "u1", "Анна", "anna@example.com").TokenVersion = 2
	ctx := context.Background()

	for _, tc := range []struct {
		user    string
		version int64
		want    bool
	}{{"u1", 2, true}, {"u1", 1, false}, {"u1", 3, false}, {"ghost", 0, false}} {
		if got, err := svc.SessionActive(ctx, tc.user, tc.version); err != nil || got != tc.want {
			t.Fatalf("SessionActive(%s, %d) = %v (%v), want %v", tc.user, tc.version, got, err, tc.want)
		}
	}

	boom := errors.New("db down")
	users.sessionErr = boom
	if _, err := svc.SessionActive(ctx, "u1", 2); !errors.Is(err, boom) {
		t.Fatalf("expected the repository error, got %v", err)
	}
}
