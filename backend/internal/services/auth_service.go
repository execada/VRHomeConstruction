package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/execada/VRHomeConstruction/backend/internal/email"
	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"
)

const (
	verificationTTL = 10 * time.Minute
	// Минимальный интервал между повторными отправками кода на один email.
	resendCooldown = 30 * time.Second
	// Сколько раз можно ошибиться в коде, прежде чем он будет аннулирован.
	maxCodeAttempts = 5
	// Неудачные входы на один адрес (и проверки пароля одного пользователя) за окно.
	maxLoginFailures   = 10
	loginFailureWindow = 15 * time.Minute
	minPasswordRunes   = 6
	// bcrypt учитывает только первые 72 байта — более длинный пароль не принимаем.
	maxPasswordBytes = 72
	// Одновременно отправляемых писем с кодами.
	mailConcurrency = 8

	purposeLabelRegister = "регистрации"
	msgCodeInLogs        = "Код готов. Смотрите логи бэкенда (строка [CODE])"
	msgCodeSent          = "Код отправлен на email. Проверьте входящие и папку «Спам»."
)

var (
	ErrUserNotFound         = errors.New("user not found")
	ErrUserAlreadyExists    = errors.New("user already exists")
	ErrInvalidCredentials   = errors.New("invalid credentials")
	ErrInvalidCode          = errors.New("invalid code")
	ErrCodeExpired          = errors.New("code expired")
	ErrInvalidPurpose       = errors.New("invalid purpose")
	ErrCodeResendTooSoon    = errors.New("code was sent recently, wait before retrying")
	ErrTooManyAttempts      = errors.New("too many invalid attempts, request a new code")
	ErrTooManyLoginAttempts = errors.New("too many login attempts, try again later")
	ErrWrongPassword        = errors.New("invalid password")
	ErrNameRequired         = errors.New("name is required")
	ErrPasswordTooShort     = errors.New("password must be at least 6 characters")
	ErrPasswordTooLong      = errors.New("password must be at most 72 bytes")
)

// userRepository и verificationRepository — зависимости сервиса авторизации
// (объявлены на стороне потребителя, чтобы подменять фейками в тестах).
// UpdateName/UpdateEmail возвращают обновлённого пользователя или nil, если его нет.
type userRepository interface {
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	FindByID(ctx context.Context, id string) (*models.User, error)
	Insert(ctx context.Context, user *models.User) error
	UpdateName(ctx context.Context, id, name string) (*models.User, error)
	UpdateEmail(ctx context.Context, id, email string) (*models.User, error)
}

type verificationRepository interface {
	Upsert(ctx context.Context, record *models.VerificationRecord) error
	FindValid(ctx context.Context, email, purpose string) (*models.VerificationRecord, error)
	ConsumeAttempt(ctx context.Context, key models.VerificationKey, maxAttempts int) (*models.VerificationRecord, error)
	Delete(ctx context.Context, email, purpose string) error
}

type AuthService struct {
	users         userRepository
	verifications verificationRepository
	tokens        *auth.TokenService
	sender        email.Sender
	mail          *mailQueue
	failures      *failureGuard
}

func NewAuthService(
	users userRepository,
	verifications verificationRepository,
	tokens *auth.TokenService,
	sender email.Sender,
) *AuthService {
	return &AuthService{
		users:         users,
		verifications: verifications,
		tokens:        tokens,
		sender:        sender,
		mail:          newMailQueue(sender, mailConcurrency),
		failures:      newFailureGuard(maxLoginFailures, loginFailureWindow),
	}
}

// Shutdown дожидается писем, которые ещё отправляются (graceful shutdown).
func (s *AuthService) Shutdown(ctx context.Context) error {
	return s.mail.Wait(ctx)
}

// SendCode — регистрация, шаг 1: проверить данные и отправить код на почту.
// Ответ содержит токен, без которого код не подтвердить.
func (s *AuthService) SendCode(ctx context.Context, req models.SendCodeRequest) (*models.SendCodeResponse, error) {
	email := normalizeEmail(req.Email)
	purpose := strings.TrimSpace(req.Purpose)
	if purpose != models.VerificationPurposeRegister {
		return nil, ErrInvalidPurpose
	}
	name, err := validateRegistration(req)
	if err != nil {
		return nil, err
	}
	if err := s.ensureEmailFree(ctx, email, ""); err != nil {
		return nil, err
	}
	if err := s.checkResendCooldown(ctx, email, purpose); err != nil {
		return nil, err
	}

	passHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	token, tokenHash, err := newRequestToken()
	if err != nil {
		return nil, err
	}

	resp, err := s.issueCode(ctx, models.VerificationRecord{
		Email:        email,
		Purpose:      purpose,
		Name:         name,
		PasswordHash: string(passHash),
		TokenHash:    tokenHash,
	}, purposeLabelRegister)
	if err != nil {
		return nil, err
	}
	resp.Token = token
	return resp, nil
}

// VerifyCode — регистрация, шаг 2: код и токен из шага 1 создают аккаунт.
func (s *AuthService) VerifyCode(ctx context.Context, req models.VerifyCodeRequest) (*models.AuthResponse, error) {
	email := normalizeEmail(req.Email)
	purpose := strings.TrimSpace(req.Purpose)
	// Проверяем цель до поиска записи: коды смены email этот сценарий не трогает.
	if purpose != models.VerificationPurposeRegister {
		return nil, ErrInvalidPurpose
	}

	key := models.VerificationKey{Email: email, Purpose: purpose, TokenHash: hashRequestToken(req.Token)}
	record, err := s.verifyCode(ctx, key, req.Code)
	if err != nil {
		return nil, err
	}
	user, err := s.createUserFromVerification(ctx, record)
	if err != nil {
		return nil, err
	}

	s.discardCode(ctx, email, purpose)
	return s.buildAuthResponse(user)
}

// Login выполняет вход по email и паролю без кода подтверждения.
// После maxLoginFailures неудач на адрес вход блокируется на loginFailureWindow.
func (s *AuthService) Login(ctx context.Context, req models.LoginRequest) (*models.AuthResponse, error) {
	email := normalizeEmail(req.Email)
	if !s.failures.Allow(email) {
		return nil, ErrTooManyLoginAttempts
	}

	user, err := s.users.FindByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("find user by email: %w", err)
	}
	if user == nil {
		// Сравнение с фиктивным хэшем: время ответа не выдаёт, зарегистрирован ли адрес.
		_ = bcrypt.CompareHashAndPassword(dummyPasswordHash(), []byte(req.Password))
		s.failures.Fail(email)
		return nil, ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		s.failures.Fail(email)
		return nil, ErrInvalidCredentials
	}

	s.failures.Reset(email)
	return s.buildAuthResponse(user)
}

func (s *AuthService) createUserFromVerification(ctx context.Context, record *models.VerificationRecord) (*models.User, error) {
	if err := s.ensureEmailFree(ctx, record.Email, ""); err != nil {
		return nil, err
	}

	user := &models.User{
		ID:           primitive.NewObjectID().Hex(),
		Name:         record.Name,
		Email:        record.Email,
		PasswordHash: record.PasswordHash,
	}
	if err := s.users.Insert(ctx, user); err != nil {
		// Гонка двух регистраций: уникальный индекс users.email не даст вставить дубль.
		if mongo.IsDuplicateKeyError(err) {
			return nil, ErrUserAlreadyExists
		}
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return user, nil
}

func (s *AuthService) GetByID(ctx context.Context, userID string) (*models.UserPublic, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("find user %s: %w", userID, err)
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	public := user.ToPublic()
	return &public, nil
}

func (s *AuthService) buildAuthResponse(user *models.User) (*models.AuthResponse, error) {
	token, err := s.tokens.Generate(user.ID)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}
	return &models.AuthResponse{User: user.ToPublic(), Token: token}, nil
}

// validateRegistration проверяет имя и пароль; возвращает нормализованное имя.
func validateRegistration(req models.SendCodeRequest) (string, error) {
	if strings.TrimSpace(req.Name) == "" {
		return "", ErrNameRequired
	}
	name, err := normalizeName(req.Name, maxUserNameLen)
	if err != nil {
		return "", err
	}
	if err := validatePassword(req.Password); err != nil {
		return "", err
	}
	return name, nil
}

func validatePassword(password string) error {
	if utf8.RuneCountInString(password) < minPasswordRunes {
		return ErrPasswordTooShort
	}
	if len(password) > maxPasswordBytes {
		return ErrPasswordTooLong
	}
	return nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
