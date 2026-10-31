package services

import (
	"context"
	"fmt"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"
)

const purposeLabelChangeEmail = "смены email"

// UpdateProfile меняет имя пользователя (PATCH /api/auth/me).
func (s *AuthService) UpdateProfile(ctx context.Context, userID string, req models.UpdateProfileRequest) (*models.UserPublic, error) {
	name, err := normalizeName(req.Name, maxUserNameLen)
	if err != nil {
		return nil, err
	}

	user, err := s.users.UpdateName(ctx, userID, name)
	if err != nil {
		return nil, fmt.Errorf("update user name: %w", err)
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	public := user.ToPublic()
	return &public, nil
}

// SendEmailChangeCode отправляет код подтверждения на новый адрес. Запись кода
// привязана к запросившему пользователю — подтвердить смену может только он.
func (s *AuthService) SendEmailChangeCode(ctx context.Context, userID string, req models.EmailChangeCodeRequest) (*models.SendCodeResponse, error) {
	newEmail := normalizeEmail(req.NewEmail)
	if err := validateEmailFormat(newEmail); err != nil {
		return nil, err
	}

	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("find user %s: %w", userID, err)
	}
	if user == nil {
		return nil, ErrUserNotFound
	}
	if err := s.checkCurrentPassword(user, req.Password); err != nil {
		return nil, err
	}

	// Занятым считается и текущий адрес самого пользователя.
	if err := s.ensureEmailFree(ctx, newEmail, ""); err != nil {
		return nil, err
	}

	purpose := models.VerificationPurposeChangeEmail
	if err := s.checkResendCooldown(ctx, newEmail, purpose); err != nil {
		return nil, err
	}

	return s.issueCode(ctx, models.VerificationRecord{
		Email:   newEmail,
		Purpose: purpose,
		UserID:  user.ID,
	}, purposeLabelChangeEmail)
}

// VerifyEmailChange проверяет код и меняет email пользователя на подтверждённый адрес.
func (s *AuthService) VerifyEmailChange(ctx context.Context, userID string, req models.EmailChangeVerifyRequest) (*models.UserResponse, error) {
	newEmail := normalizeEmail(req.NewEmail)
	if err := validateEmailFormat(newEmail); err != nil {
		return nil, err
	}
	purpose := models.VerificationPurposeChangeEmail

	// Код, запрошенный другим пользователем, выглядит как отсутствующий:
	// его попытки не расходуются, а сам факт запроса не раскрывается.
	key := models.VerificationKey{Email: newEmail, Purpose: purpose, UserID: userID}
	if _, err := s.verifyCode(ctx, key, req.Code); err != nil {
		return nil, err
	}

	if err := s.ensureEmailFree(ctx, newEmail, userID); err != nil {
		return nil, err
	}
	user, err := s.users.UpdateEmail(ctx, userID, newEmail)
	if err != nil {
		// Гонка: адрес заняли между проверкой и обновлением (уникальный индекс users.email).
		if mongo.IsDuplicateKeyError(err) {
			return nil, ErrUserAlreadyExists
		}
		return nil, fmt.Errorf("update user email: %w", err)
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	s.discardCode(ctx, newEmail, purpose)
	return &models.UserResponse{User: user.ToPublic()}, nil
}

// ensureEmailFree возвращает ErrUserAlreadyExists, если адрес принадлежит кому-то,
// кроме exceptUserID ("" — занятым считается любой владелец).
func (s *AuthService) ensureEmailFree(ctx context.Context, email, exceptUserID string) error {
	owner, err := s.users.FindByEmail(ctx, email)
	if err != nil {
		return fmt.Errorf("find user by email: %w", err)
	}
	if owner != nil && (exceptUserID == "" || owner.ID != exceptUserID) {
		return ErrUserAlreadyExists
	}
	return nil
}

// checkCurrentPassword подтверждает личность перед сменой почты. Неудачи считаются
// вместе с входом: перебирать пароль через этот эндпоинт тоже нельзя.
func (s *AuthService) checkCurrentPassword(user *models.User, password string) error {
	key := "user:" + user.ID
	if !s.failures.Allow(key) {
		return ErrTooManyLoginAttempts
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		s.failures.Fail(key)
		return ErrWrongPassword
	}
	s.failures.Reset(key)
	return nil
}
