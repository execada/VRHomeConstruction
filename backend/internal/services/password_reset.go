package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"golang.org/x/crypto/bcrypt"
)

const (
	purposeLabelResetPassword = "восстановления пароля"
	// Неверные коды сброса пароля на один адрес за окно — по всем выданным кодам:
	// новый код не даёт новых попыток угадать (у каждого кода ещё и свои maxCodeAttempts).
	maxResetFailures   = 10
	resetFailureWindow = time.Hour

	// Ответ на запрос кода одинаковый, есть ли аккаунт с такой почтой или нет.
	msgResetCodeSent   = "Если аккаунт с этой почтой есть, мы отправили на неё код. Проверьте входящие и папку «Спам»."
	msgResetCodeInLogs = "Если аккаунт с этой почтой есть, код готов — смотрите логи бэкенда (строка [CODE])."
	msgPasswordChanged = "Пароль изменён. Войдите с новым паролем."
)

// ErrTooManyResetAttempts — по адресу слишком много неверных кодов сброса за окно.
var ErrTooManyResetAttempts = errors.New("too many password reset attempts, try again later")

// SendPasswordResetCode — восстановление пароля, шаг 1: код на почту. Ответ не выдаёт, есть ли
// аккаунт: запись кода создаётся и для адреса без аккаунта (пауза перед повтором и попытки
// ведут себя одинаково), но письмо уходит только владельцу аккаунта.
func (s *AuthService) SendPasswordResetCode(ctx context.Context, req models.PasswordResetCodeRequest) (*models.SendCodeResponse, error) {
	address := normalizeEmail(req.Email)
	if err := validateEmailFormat(address); err != nil {
		return nil, err
	}
	purpose := models.VerificationPurposeResetPassword
	if err := s.checkResendCooldown(ctx, address, purpose); err != nil {
		return nil, err
	}
	user, err := s.users.FindByEmail(ctx, address)
	if err != nil {
		return nil, fmt.Errorf("find user by email: %w", err)
	}

	pending := models.VerificationRecord{Email: address, Purpose: purpose}
	if user != nil {
		pending.UserID = user.ID
	}
	code, err := s.storeCode(ctx, pending)
	if err != nil {
		return nil, err
	}
	if user != nil {
		s.mail.Send(address, code, purposeLabelResetPassword)
	}

	if s.sender.LogOnly() {
		return &models.SendCodeResponse{Message: msgResetCodeInLogs}, nil
	}
	return &models.SendCodeResponse{Message: msgResetCodeSent}, nil
}

// ResetPassword — восстановление пароля, шаг 2: код из письма и новый пароль. Код одноразовый;
// вместе с паролем растёт версия сессий — все выданные раньше токены перестают действовать,
// войти нужно заново с новым паролем.
func (s *AuthService) ResetPassword(ctx context.Context, req models.PasswordResetRequest) (*models.MessageResponse, error) {
	address := normalizeEmail(req.Email)
	if err := validateEmailFormat(address); err != nil {
		return nil, err
	}
	// Пароль — до кода: из-за неподходящего пароля попытка ввода кода не тратится.
	if err := validatePassword(req.Password); err != nil {
		return nil, err
	}
	record, err := s.checkResetCode(ctx, address, req.Code)
	if err != nil {
		return nil, err
	}
	// Хэш — до того, как код будет забран: сбой здесь не сжигает код.
	passHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	if err := s.claimCode(ctx, record); err != nil {
		return nil, err
	}

	user, err := s.users.UpdatePassword(ctx, record.UserID, address, string(passHash))
	if err != nil {
		return nil, fmt.Errorf("update password: %w", err)
	}
	if user == nil {
		// Пока шло письмо, аккаунт удалили или сменили у него почту: код был для прежней.
		return nil, ErrCodeExpired
	}

	// Забытый пароль часто заканчивается блокировкой входа — с новым паролем она не нужна.
	s.failures.Reset(address)
	s.failures.Reset(userFailureKey(user.ID))
	s.resetFailures.Reset(address)
	log.Printf("[AUTH] password reset user=%s, sessions revoked", user.ID)
	return &models.MessageResponse{Message: msgPasswordChanged}, nil
}

// checkResetCode тратит попытку и сверяет код. Неверные коды считаются по адресу за окно:
// после maxResetFailures сброс закрыт до конца окна, даже с верным кодом. Это и защита от
// перебора с разных IP, и цена: чужие неверные коды тоже закрывают сброс — как блокировка входа.
func (s *AuthService) checkResetCode(ctx context.Context, address, code string) (*models.VerificationRecord, error) {
	if !s.resetFailures.Allow(address) {
		return nil, ErrTooManyResetAttempts
	}
	key := models.VerificationKey{Email: address, Purpose: models.VerificationPurposeResetPassword}
	record, err := s.consumeAttempt(ctx, key)
	if err != nil {
		return nil, err
	}
	// Код сверяется всегда — время ответа не выдаёт адрес без аккаунта. Такому адресу код
	// никто не отправлял: даже угаданный, он ведёт себя как неверный.
	matches := codeMatches(record, code)
	if !matches || record.UserID == "" {
		s.resetFailures.Fail(address)
		return nil, wrongCodeError(record)
	}
	return record, nil
}

// claimCode забирает проверенную запись кода: из параллельных подтверждений одного кода
// проходит одно, повторно код не сработает.
func (s *AuthService) claimCode(ctx context.Context, record *models.VerificationRecord) error {
	claimed, err := s.verifications.Claim(ctx, record.ID, record.CodeHash)
	if err != nil {
		return fmt.Errorf("claim reset code: %w", err)
	}
	if !claimed {
		// Этот код уже использован (параллельный запрос) или заменён новым.
		return ErrCodeExpired
	}
	return nil
}

// SessionActive сообщает, действует ли сессия пользователя с версией version: версия растёт при
// сбросе пароля, у удалённого пользователя сессий нет (middleware.SessionChecker).
func (s *AuthService) SessionActive(ctx context.Context, userID string, version int64) (bool, error) {
	current, found, err := s.users.SessionVersion(ctx, userID)
	if err != nil {
		return false, fmt.Errorf("session version %s: %w", userID, err)
	}
	return found && current == version, nil
}

// userFailureKey — ключ счётчика неудачных проверок пароля пользователя.
func userFailureKey(userID string) string { return "user:" + userID }
